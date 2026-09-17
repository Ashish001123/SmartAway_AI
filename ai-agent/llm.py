import os

from dotenv import load_dotenv
from openai import OpenAI

load_dotenv()

MODEL = os.getenv("OPENAI_MODEL", "gpt-4o-mini")

_client = None


def get_client() -> OpenAI:
    """Build the client on first use so a missing key fails the request with a clear error instead of crashing boot."""
    global _client
    if _client is None:
        api_key = os.getenv("OPENAI_API_KEY")
        if not api_key:
            raise RuntimeError("OPENAI_API_KEY is not set on the AI service")
        # OPENAI_BASE_URL lets you point at any OpenAI-compatible provider (e.g. Groq, OpenRouter)
        _client = OpenAI(
            api_key=api_key,
            base_url=os.getenv("OPENAI_BASE_URL") or None,
            timeout=45,
            max_retries=1,
        )
    return _client


def complete(messages: list, **kwargs) -> str:
    response = get_client().chat.completions.create(model=MODEL, messages=messages, **kwargs)
    content = response.choices[0].message.content
    if not content or not content.strip():
        raise ValueError("LLM returned an empty response")
    return content.strip()
