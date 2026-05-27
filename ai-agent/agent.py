

from dotenv import load_dotenv
from openai import OpenAI
from rag.rag import retrieve
from mem0 import Memory
import uuid
import os

load_dotenv()

client = OpenAI(api_key=os.getenv("OPENAI_API_KEY"))

config = {
    "vector_store": {
        "provider": "qdrant",
        "config": {
            "host": "localhost",
            "port": 6333
        }
    }
}

try:
    memory_client = Memory.from_config(config)
    print("✅ Memory client connected to Qdrant")
except Exception as e:
    print(f"⚠️  Qdrant not available, memory disabled: {e}")
    memory_client = None

SYSTEM_PROMPT = """
You are an AI assistant for the Chatty application.

STRICT RULES:
- First check Past Memory for personal questions (like name, preferences, etc.)
- Acknowledge when the user shares personal facts, introduces themselves, or greets you.
- Answer app questions from provided context (RAG)
- Do NOT use your own knowledge for external facts.
- If the user asks a question out of scope or not found in context/memory, say:
  "I can only help with the chatty application information 😊"

FORMATTING RULES:
- DO NOT use markdown (#, ##, ###)
- Use emojis instead for headings 
- Use bullet points and spacing for clean UI
- Keep answers short, clear, and helpful
- Use friendly tone with emojis 😊
"""

def get_safe_user_id(user_id):
    return str(uuid.uuid5(uuid.NAMESPACE_DNS, user_id))

def improve_text(user_text: str) -> str:
    try:
        response = client.chat.completions.create(
            model="gpt-4o-mini",
            messages=[
                {
                    "role": "system",
                    "content": (
                        "You are an English assistant. "
                        "Fix grammar, improve clarity, make it natural. "
                        "Add relevant emojis. Keep it short and friendly."
                        "Always give user 4 to 5 sentence of better english in seperated line and formated manner"
                    )
                },
                {
                    "role": "user",
                    "content": user_text
                }
            ],
            max_tokens=150,
            temperature=0.7
        )

        improved = response.choices[0].message.content.strip()

        return f"✍️ Improved Text:\n{improved}"

    except Exception as e:
        return f"Error: {str(e)}"

def detect_intent(user_query: str) -> str:
    try:
        response = client.chat.completions.create(
            model="gpt-4o-mini",
            messages=[
                {
                    "role": "system",
                    "content": "Classify the intent as either 'improve_text' or 'chat_query'. Only return one word."
                },
                {
                    "role": "user",
                    "content": user_query
                }
            ],
            max_tokens=5
        )

        return response.choices[0].message.content.lower()

    except:
        return "chat_query"

def run_agent(user_query: str, user_id: str):
    try:
        safe_user_id = get_safe_user_id(user_id)

        intent = detect_intent(user_query)
        if "improve" in intent or any(word in user_query.lower() for word in ["correct", "fix", "grammar", "rewrite"]):
            return improve_text(user_query)

        context_chunks = retrieve(user_query)

        if not context_chunks:
            context_chunks = retrieve("chatty application features messaging flow authentication")

        context = "\n\n".join(context_chunks) if isinstance(context_chunks, list) else context_chunks

        if memory_client is not None:
            try:
                memories = memory_client.search(query=user_query, user_id=safe_user_id)
            except Exception:
                try:
                    memories = memory_client.get_all(user_id=safe_user_id)
                except Exception:
                    memories = {}
        else:
            memories = {}

        if isinstance(memories, dict) and "results" in memories:
            memories_list = memories["results"]
        else:
            memories_list = memories if isinstance(memories, list) else []

        past_memory = "\n".join(
            [m.get("memory", m.get("text", "")) if isinstance(m, dict) else str(m) for m in memories_list]
        ) if memories_list else ""

        prompt = f"""
Context:
{context}

Past Memory:
{past_memory}

Question:
{user_query}
"""

        response = client.chat.completions.create(
            model="gpt-4o-mini",
            messages=[
                {"role": "system", "content": SYSTEM_PROMPT},
                {"role": "user", "content": prompt}
            ],
            temperature=0.7
        )

        reply = response.choices[0].message.content

        if memory_client is not None:
            memory_client.add(
                user_id=safe_user_id,
                messages=[
                    {"role": "user", "content": user_query},
                    {"role": "assistant", "content": reply}
                ]
            )

        return reply

    except Exception as e:
        import traceback
        traceback.print_exc()
        return "AI error"

def generate_busy_reply(sender_name: str, receiver_name: str, message_text: str, busy_message: str, chat_history: list) -> str:
    try:

        history_str = ""
        for msg in chat_history:
            sender = msg.get("sender", "Unknown")
            text = msg.get("text", "")
            history_str += f"- {sender}: {text}\n"

        is_first_reply = not any("(AI)" in msg.get("sender", "") for msg in chat_history)

        if is_first_reply:
            first_reply_rule = f"""IMPORTANT: This is your FIRST reply to {sender_name}.
You MUST:
1. Introduce yourself as {receiver_name}'s AI assistant.
2. Clearly explain to {sender_name} that {receiver_name} is busy based on these instructions: "{busy_message}".
3. Offer to help or take a message.
Example opening: "Hi {sender_name}! 👋 I'm {receiver_name}'s AI assistant. {receiver_name} is currently busy ({busy_message}). How can I help you? 😊"
"""
        else:
            first_reply_rule = f"""This is a follow-up message in an ongoing conversation.
- {receiver_name} is STILL busy.
- If {sender_name} asks "where is {receiver_name}", "what is {receiver_name} doing", when {receiver_name} will be free, or anything about their availability/status → strictly answer using the instructions: "{busy_message}".
- If they ask general questions, seek help, or chat → reply helpfully and naturally while respecting the guidelines in the instructions.
- Keep a friendly tone. Use emojis. 1-3 sentences max.
"""

        system_prompt = f"""You are {receiver_name}'s AI assistant handling messages while {receiver_name} is busy.

Here are {receiver_name}'s current busy status and specific instructions/facts for you to follow:
"{busy_message}"

{first_reply_rule}

RULES (always):
- NEVER pretend to be {receiver_name} directly — you are their AI assistant.
- Follow and apply all facts, times, instructions, and study/work guidelines specified in the instructions above.
- Always be honest about {receiver_name}'s busy status and availability.
- Keep replies SHORT: 1-3 sentences. Use emojis naturally.
- Be warm, friendly, and helpful."""

        user_content = f"""Conversation so far:
{history_str if history_str.strip() else "(this is the first message)"}

{sender_name} just said: "{message_text}"

Write your reply:"""

        response = client.chat.completions.create(
            model="gpt-4o-mini",
            messages=[
                {"role": "system", "content": system_prompt},
                {"role": "user", "content": user_content}
            ],
            temperature=0.75,
            max_tokens=120
        )
        return response.choices[0].message.content.strip()
    except Exception as e:
        print("Error in generate_busy_reply:", e)
        # Use a safe, clean fallback message that doesn't leak raw prompt instructions
        clean_busy = busy_message if len(busy_message) < 60 else "at the moment"
        return f"Hey {sender_name}! 👋 I'm {receiver_name}'s AI assistant. {receiver_name} is currently busy ({clean_busy}). I'll pass your message along! 😊"
