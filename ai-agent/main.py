import traceback
from typing import Optional

from dotenv import load_dotenv
from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel

load_dotenv()

from agent import run_agent, generate_busy_reply, generate_digest

app = FastAPI()

app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        "http://localhost:5173",
        "https://fullstack-chat-app-32t0.onrender.com"
    ],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


def _fail(error: Exception):
    traceback.print_exc()
    # A real error status lets the backend log the cause and use its own fallback
    raise HTTPException(status_code=502, detail=f"{type(error).__name__}: {error}")


class Query(BaseModel):
    message: str
    userId: str
    history: list = []


@app.get("/")
def home():
    return {"message": "AI is running 🚀"}


@app.get("/health")
def health():
    return {"status": "running"}


@app.post("/chat")
def chat(query: Query):
    try:
        response = run_agent(
            user_query=query.message,
            user_id=query.userId,
            history=query.history
        )
    except Exception as e:
        _fail(e)
    return {"result": response}


class BusyQuery(BaseModel):
    senderName: str
    receiverName: str
    messageText: str
    busyMessage: str = ""
    chatHistory: list = []
    isFirstReply: Optional[bool] = None
    busyUntilText: Optional[str] = None
    ownerRecentlyNotified: bool = False
    autoNotifiedReason: Optional[str] = None
    agentPersona: str = "friendly"
    contactMemory: list = []
    calendarNote: Optional[str] = None
    availableSlots: list = []


@app.post("/busy-reply")
def busy_reply(query: BusyQuery):
    try:
        response = generate_busy_reply(
            sender_name=query.senderName,
            receiver_name=query.receiverName,
            message_text=query.messageText,
            busy_message=query.busyMessage,
            chat_history=query.chatHistory,
            is_first_reply=query.isFirstReply,
            busy_until_text=query.busyUntilText,
            owner_recently_notified=query.ownerRecentlyNotified,
            auto_notified_reason=query.autoNotifiedReason,
            agent_persona=query.agentPersona,
            contact_memory=query.contactMemory,
            calendar_note=query.calendarNote,
            available_slots=query.availableSlots
        )
    except Exception as e:
        _fail(e)
    return {
        "result": response["reply"],
        "notifyOwner": response["notify_owner"],
        "urgency": response["urgency"],
        "summary": response["summary"],
        "remember": response["remember"],
        "offerSlots": response["offer_slots"]
    }


class DigestQuery(BaseModel):
    ownerName: str
    agentPersona: str = "friendly"
    conversations: list = []


@app.post("/digest")
def digest(query: DigestQuery):
    try:
        items = generate_digest(
            owner_name=query.ownerName,
            persona=query.agentPersona,
            conversations=query.conversations
        )
    except Exception as e:
        _fail(e)
    return {"items": items}
