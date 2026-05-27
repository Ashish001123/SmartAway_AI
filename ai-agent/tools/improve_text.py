import os
from openai import OpenAI

client = OpenAI(api_key=os.getenv("OPENAI_API_KEY"))

def improve_text_tool(user_text: str) -> str:
    """
    सुधारता है English:
    - Grammar fix
    - Better sentence
    - Add emojis
    """

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

        return response.choices[0].message.content.strip()

    except Exception as e:
        return f"Error: {str(e)}"