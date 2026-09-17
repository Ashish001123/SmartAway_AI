import json
import re
import traceback
import uuid

from llm import complete
from rag.rag import retrieve

try:
    from mem0 import Memory

    memory_client = Memory.from_config({
        "vector_store": {
            "provider": "qdrant",
            "config": {
                "host": "localhost",
                "port": 6333
            }
        }
    })
    print("✅ Memory client connected to Qdrant")
except Exception as e:
    print(f"⚠️  Qdrant not available, memory disabled: {e}")
    memory_client = None

SYSTEM_PROMPT = """
You are the AI assistant for the SmartWay AI chat application.

STRICT RULES:
- First check Past Memory and the recent conversation for personal questions (like name, preferences, etc.)
- Acknowledge when the user shares personal facts, introduces themselves, or greets you.
- Answer app questions from the provided Context (RAG)
- Do NOT use your own knowledge for external facts.
- If the user asks a question out of scope or not found in context/memory, say:
  "I can only help with the SmartWay AI application information 😊"

FORMATTING RULES:
- DO NOT use markdown (#, ##, ###)
- Use emojis instead for headings
- Use bullet points and spacing for clean UI
- Keep answers short, clear, and helpful
- Use friendly tone with emojis 😊
"""

MAX_HISTORY_MESSAGES = 12


def get_safe_user_id(user_id):
    return str(uuid.uuid5(uuid.NAMESPACE_DNS, user_id))


def improve_text(user_text: str) -> str:
    improved = complete(
        [
            {
                "role": "system",
                "content": (
                    "You are an English assistant. "
                    "Fix grammar, improve clarity, make it natural. "
                    "Add relevant emojis. Keep it short and friendly. "
                    "Always give user 4 to 5 sentence of better english in seperated line and formated manner"
                )
            },
            {"role": "user", "content": user_text}
        ],
        max_tokens=300,
        temperature=0.7
    )
    return f"✍️ Improved Text:\n{improved}"


def detect_intent(user_query: str) -> str:
    try:
        intent = complete(
            [
                {
                    "role": "system",
                    "content": (
                        "Classify the user's message. Reply with exactly one word: "
                        "'improve_text' if they explicitly ask to fix, correct, rewrite or improve a piece of text they provided, "
                        "otherwise 'chat_query'."
                    )
                },
                {"role": "user", "content": user_query}
            ],
            max_tokens=5,
            temperature=0
        )
        return intent.lower()
    except Exception:
        return "chat_query"


def _search_memory(user_query: str, safe_user_id: str) -> str:
    if memory_client is None:
        return ""
    try:
        memories = memory_client.search(query=user_query, user_id=safe_user_id)
    except Exception:
        try:
            memories = memory_client.get_all(user_id=safe_user_id)
        except Exception:
            return ""

    if isinstance(memories, dict) and "results" in memories:
        memories = memories["results"]
    if not isinstance(memories, list):
        return ""
    return "\n".join(
        m.get("memory", m.get("text", "")) if isinstance(m, dict) else str(m) for m in memories
    )


def run_agent(user_query: str, user_id: str, history: list = None) -> str:
    """Answers AI Assistant chats. Raises on LLM failure so the caller can report it."""
    safe_user_id = get_safe_user_id(user_id)

    if "improve_text" in detect_intent(user_query):
        return improve_text(user_query)

    context = "\n\n".join(retrieve(user_query))
    past_memory = _search_memory(user_query, safe_user_id)

    messages = [{
        "role": "system",
        "content": f"{SYSTEM_PROMPT}\nContext:\n{context}\n\nPast Memory:\n{past_memory or '(none)'}"
    }]
    for item in (history or [])[-MAX_HISTORY_MESSAGES:]:
        role = item.get("role")
        content = (item.get("content") or "").strip()
        if role in ("user", "assistant") and content:
            messages.append({"role": role, "content": content})
    messages.append({"role": "user", "content": user_query})

    reply = complete(messages, temperature=0.7)

    if memory_client is not None:
        try:
            memory_client.add(
                user_id=safe_user_id,
                messages=[
                    {"role": "user", "content": user_query},
                    {"role": "assistant", "content": reply}
                ]
            )
        except Exception:
            traceback.print_exc()

    return reply


def _transcript_line(msg: dict, sender_name: str, receiver_name: str):
    text = (msg.get("text") or "").strip()
    if not text:
        return None
    role = msg.get("role")
    if role is None:
        # Older backend payloads label turns by name, marking the agent's turns with "(AI)"
        label = msg.get("sender", "")
        role = "assistant" if "(AI)" in label else "sender" if label == sender_name else "owner"
    speaker = {
        "sender": sender_name,
        "assistant": "You (assistant)",
        "owner": f"{receiver_name} (personally)",
    }.get(role, sender_name)
    return f"{speaker}: {text}"


def _busy_agent_prompt(sender: str, owner: str, busy_note: str, busy_until: str,
                       is_first_reply: bool, owner_recently_notified: bool) -> str:
    note = f'"{busy_note}"' if busy_note else "(no note left)"
    if is_first_reply:
        turn_rule = (
            f"This is your first message to {sender} since {owner} became busy: briefly introduce yourself as "
            f"{owner}'s AI assistant, say {owner} is busy (and when they'll be free, if known), respond to what "
            f"{sender} said, and mention you can notify {owner} if it's urgent."
        )
    else:
        turn_rule = (
            "You've already introduced yourself in this conversation, so don't do it again. "
            "Just continue the conversation naturally."
        )
    notified_rule = (
        f"- {owner} was already notified about this conversation a few minutes ago. Don't set notify_owner again "
        f"unless {sender} raises something new and urgent; reassure them that {owner} already knows instead.\n"
        if owner_recently_notified else ""
    )

    return f"""You are {owner}'s personal AI assistant inside the SmartWay AI chat app. {owner} is busy right now, so you are chatting with {sender} on {owner}'s behalf.

What you know about {owner}'s availability:
- Note from {owner}: {note}
- Free again: {busy_until or "not specified"}

How to chat:
- Hold a real, natural conversation with {sender}: answer their questions, reply to small talk, and help with general questions like a friendly, capable assistant would.
- Use {owner}'s note to answer anything about their availability, whereabouts or schedule, and follow any instructions {owner} left in it (for example what to tell people about a topic). Don't paste the note word for word.
- Never make up facts about {owner} (plans, opinions, location, promises) that the note doesn't cover. If you don't know, say so and offer to pass the question on.
- Never agree to anything on {owner}'s behalf (meetings, payments, favours, deadlines). Offer to notify {owner} instead.
- You are the assistant, not {owner}: always refer to {owner} in the third person.
- Keep every reply short (1-3 sentences), warm and in plain chat text: no markdown, at most one or two emojis. Reply in the language {sender} writes in.

Notifying {owner}:
- You can send {owner} an instant notification. Set "notify_owner" to true only when {sender} asks you to tell, notify, inform or ping {owner}, says it's urgent or an emergency, or accepts your offer to notify {owner}.
- When you set it, write one sentence describing what {sender} needs in "summary", set "urgency" to "urgent" if it's time-sensitive, and confirm in your reply that {owner} has been notified.
- If {sender} needs {owner} personally or the matter sounds important, offer to notify {owner}, but don't notify without being asked.
{notified_rule}
{turn_rule}

Respond with a JSON object only, in exactly this shape:
{{"reply": "<your message to {sender}>", "notify_owner": false, "urgency": "normal", "summary": ""}}"""


def _parse_agent_output(content: str) -> dict:
    data = None
    try:
        data = json.loads(content)
    except json.JSONDecodeError:
        match = re.search(r"\{.*\}", content, re.DOTALL)
        if match:
            try:
                data = json.loads(match.group(0))
            except json.JSONDecodeError:
                pass

    if not isinstance(data, dict):
        # The model ignored the JSON format; its text is still a usable reply
        return {"reply": content.strip(), "notify_owner": False, "urgency": "normal", "summary": ""}

    reply = str(data.get("reply") or "").strip()
    if not reply:
        raise ValueError(f"Busy agent returned no reply: {content[:200]}")
    notify = data.get("notify_owner") is True or str(data.get("notify_owner")).lower() == "true"
    return {
        "reply": reply,
        "notify_owner": notify,
        "urgency": "urgent" if str(data.get("urgency")).lower() == "urgent" else "normal",
        "summary": str(data.get("summary") or "").strip()[:300] if notify else "",
    }


def generate_busy_reply(sender_name: str, receiver_name: str, message_text: str, busy_message: str,
                        chat_history: list, is_first_reply: bool = None, busy_until_text: str = None,
                        owner_recently_notified: bool = False) -> dict:
    """Replies to someone messaging a busy user. Raises on LLM failure so the backend can fall back."""
    lines = [_transcript_line(msg, sender_name, receiver_name) for msg in chat_history if isinstance(msg, dict)]
    transcript = "\n".join(line for line in lines if line)

    if is_first_reply is None:
        is_first_reply = not any(
            msg.get("role") == "assistant" or "(AI)" in msg.get("sender", "")
            for msg in chat_history if isinstance(msg, dict)
        )

    system_prompt = _busy_agent_prompt(
        sender_name, receiver_name, (busy_message or "").strip(), busy_until_text,
        is_first_reply, owner_recently_notified,
    )
    user_content = f"""Conversation so far (oldest first):
{transcript or "(no earlier messages)"}

New message from {sender_name}:
{message_text.strip() or "(empty message)"}"""

    content = complete(
        [
            {"role": "system", "content": system_prompt},
            {"role": "user", "content": user_content}
        ],
        temperature=0.7,
        max_tokens=350,
        response_format={"type": "json_object"},
    )
    return _parse_agent_output(content)
