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

PERSONA_STYLES = {
    "friendly": "warm and friendly, with at most one or two emojis",
    "professional": "polite, clear and professional, with no emojis or slang",
    "funny": "light-hearted and playful, with a little humour where it fits, but still helpful and never rude",
}


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


def _busy_agent_prompt(sender: str, owner: str, busy_note: str, busy_until: str, is_first_reply: bool,
                       owner_recently_notified: bool, auto_notified_reason: str, persona: str,
                       contact_memory: list, calendar_note: str, available_slots: list) -> str:
    note = f'"{busy_note}"' if busy_note else "(no note left)"
    style = PERSONA_STYLES.get(persona, PERSONA_STYLES["friendly"])

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

    if auto_notified_reason:
        notified_rule = (
            f"- {owner} has just been notified automatically because {auto_notified_reason}. Tell {sender} that "
            f"{owner} has been alerted, and leave notify_owner false.\n"
        )
    elif owner_recently_notified:
        notified_rule = (
            f"- {owner} was already notified about this conversation a few minutes ago. Don't set notify_owner again "
            f"unless {sender} raises something new and urgent; reassure them that {owner} already knows instead.\n"
        )
    else:
        notified_rule = ""

    calendar_line = f"- Calendar: {calendar_note}\n" if calendar_note else ""

    slots = [str(slot).strip() for slot in available_slots or [] if str(slot).strip()]
    if slots:
        callback_block = (
            f"Callbacks:\n- {owner} is free to call {sender} back at these times ({owner}'s time zone):\n"
            + "\n".join(f"  - {slot}" for slot in slots)
            + f"\n- If {sender} wants to talk, call or meet {owner}, or asks when they can reach them, set "
            f"\"offer_slots\" to true and tell them they can pick a callback time with the buttons under your "
            "message. Never invent other times or say anything is booked.\n"
        )
    else:
        callback_block = (
            f"Callbacks:\n- There are no free times to offer right now, so don't promise a specific time; "
            f"offer to notify {owner} instead. Leave offer_slots false.\n"
        )

    facts = [str(fact).strip() for fact in contact_memory or [] if str(fact).strip()]
    memory_block = (
        f"\nWhat you remember about {sender} from earlier conversations (use it to follow up naturally, don't recite it):\n"
        + "\n".join(f"- {fact}" for fact in facts) + "\n"
        if facts else ""
    )

    return f"""You are {owner}'s personal AI assistant inside the SmartWay AI chat app. {owner} is busy right now, so you are chatting with {sender} on {owner}'s behalf.

What you know about {owner}'s availability:
- Note from {owner}: {note}
- Free again: {busy_until or "not specified"}
{calendar_line}{memory_block}
How to chat:
- Hold a real, natural conversation with {sender}: answer their questions, reply to small talk, and help with general questions like a capable assistant would.
- Use {owner}'s note to answer anything about their availability, whereabouts or schedule, and follow any instructions {owner} left in it (for example what to tell people about a topic). Don't paste the note word for word.
- Never make up facts about {owner} (plans, opinions, location, promises) that the note doesn't cover. If you don't know, say so and offer to pass the question on.
- Never agree to anything on {owner}'s behalf (meetings, payments, favours, deadlines). Offer to notify {owner} instead.
- You are the assistant, not {owner}: always refer to {owner} in the third person.
- Keep every reply short (1-3 sentences) in plain chat text with no markdown. Your tone is {style}. Reply in the language {sender} writes in.

Notifying {owner}:
- You can send {owner} an instant notification. Set "notify_owner" to true only when {sender} asks you to tell, notify, inform or ping {owner}, says it's urgent or an emergency, or accepts your offer to notify {owner}.
- When you set it, write one sentence describing what {sender} needs in "summary", set "urgency" to "urgent" if it's time-sensitive, and confirm in your reply that {owner} has been notified.
- If {sender} needs {owner} personally or the matter sounds important, offer to notify {owner}, but don't notify without being asked.
{notified_rule}
{callback_block}
Remembering:
- If {sender} shares something worth remembering for future conversations (what they need, a deadline, what they're waiting for), put it in "remember" as one short sentence about {sender}. Otherwise leave it empty. Don't repeat things you already remember.

{turn_rule}

Respond with a JSON object only, in exactly this shape:
{{"reply": "<your message to {sender}>", "notify_owner": false, "urgency": "normal", "summary": "", "remember": "", "offer_slots": false}}"""


def _load_json_object(content: str):
    """Parses a JSON object, tolerating extra text around it. Returns None if there isn't one."""
    try:
        data = json.loads(content)
    except json.JSONDecodeError:
        match = re.search(r"\{.*\}", content, re.DOTALL)
        if not match:
            return None
        try:
            data = json.loads(match.group(0))
        except json.JSONDecodeError:
            return None
    return data if isinstance(data, dict) else None


def _parse_agent_output(content: str) -> dict:
    data = _load_json_object(content)

    if not isinstance(data, dict):
        # The model ignored the JSON format; its text is still a usable reply
        return {"reply": content.strip(), "notify_owner": False, "urgency": "normal", "summary": "", "remember": "",
                "offer_slots": False}

    reply = str(data.get("reply") or "").strip()
    if not reply:
        raise ValueError(f"Busy agent returned no reply: {content[:200]}")
    notify = data.get("notify_owner") is True or str(data.get("notify_owner")).lower() == "true"
    return {
        "reply": reply,
        "notify_owner": notify,
        "urgency": "urgent" if str(data.get("urgency")).lower() == "urgent" else "normal",
        "summary": str(data.get("summary") or "").strip()[:300] if notify else "",
        "remember": str(data.get("remember") or "").strip()[:200],
        "offer_slots": data.get("offer_slots") is True or str(data.get("offer_slots")).lower() == "true",
    }


def generate_busy_reply(sender_name: str, receiver_name: str, message_text: str, busy_message: str,
                        chat_history: list, is_first_reply: bool = None, busy_until_text: str = None,
                        owner_recently_notified: bool = False, auto_notified_reason: str = None,
                        agent_persona: str = "friendly", contact_memory: list = None, calendar_note: str = None,
                        available_slots: list = None) -> dict:
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
        is_first_reply, owner_recently_notified, auto_notified_reason, agent_persona, contact_memory,
        calendar_note, available_slots,
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


DIGEST_PRIORITIES = ("high", "medium", "low")


def generate_digest(owner_name: str, persona: str, conversations: list) -> list:
    """Summarises chats the busy agent handled. Raises on LLM failure so the backend can fall back."""
    style = PERSONA_STYLES.get(persona, PERSONA_STYLES["friendly"])
    blocks = []
    for convo in conversations:
        if not isinstance(convo, dict) or not convo.get("contactId"):
            continue
        name = convo.get("contactName") or "Someone"
        speakers = {"contact": name, "assistant": "Your assistant", "owner": f"{owner_name} (you)"}
        lines = [
            f"{speakers.get(m.get('role'), name)}: {str(m.get('text') or '').strip()}"
            for m in convo.get("transcript") or []
            if isinstance(m, dict) and str(m.get("text") or "").strip()
        ]
        facts = []
        if convo.get("notified"):
            facts.append(f"{owner_name} was notified ({convo['notified']})")
        if convo.get("callback"):
            facts.append(f"a callback is booked for {convo['callback']}")
        if convo.get("ownerReplied"):
            facts.append(f"{owner_name} already replied personally after the assistant")
        blocks.append(
            f"Conversation with {name} (contact_id: {convo['contactId']})\n"
            + (f"Facts: {'; '.join(facts)}\n" if facts else "")
            + "\n".join(lines or ["(no readable messages)"])
        )

    if not blocks:
        return []

    system_prompt = f"""You write "While you were away" summaries for {owner_name}. Their AI assistant chatted with people while {owner_name} was busy.

For each conversation return:
- "contact_id": exactly as given.
- "summary": 1-2 sentences for {owner_name}: what the person wanted, anything the assistant arranged (notification, callback), and whether it still needs {owner_name}'s attention.
- "priority": "high" if urgent or time-sensitive, "medium" if they're waiting for a reply, "low" for small talk or already handled.
- "suggested_reply": a short message (1-2 sentences) {owner_name} could send right now, written as {owner_name} in the first person, in the language the person used, addressing what they need. Tone: {style}.

Respond with a JSON object only: {{"items": [{{"contact_id": "...", "summary": "...", "priority": "medium", "suggested_reply": "..."}}]}}"""

    content = complete(
        [
            {"role": "system", "content": system_prompt},
            {"role": "user", "content": "\n\n---\n\n".join(blocks)},
        ],
        temperature=0.4,
        max_tokens=1500,
        response_format={"type": "json_object"},
    )

    data = _load_json_object(content)
    if data is None:
        raise ValueError(f"Digest response wasn't JSON: {content[:200]}")
    items = []
    for item in data.get("items") or []:
        if not isinstance(item, dict):
            continue
        summary = str(item.get("summary") or "").strip()
        reply = str(item.get("suggested_reply") or "").strip()
        if not item.get("contact_id") or not summary or not reply:
            continue
        priority = str(item.get("priority") or "").lower()
        items.append({
            "contactId": str(item["contact_id"]),
            "summary": summary[:400],
            "priority": priority if priority in DIGEST_PRIORITIES else "medium",
            "suggestedReply": reply[:500],
        })
    return items
