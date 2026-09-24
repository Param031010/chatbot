import os
from datetime import datetime, timezone
from uuid import UUID

from dotenv import load_dotenv
from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from groq import Groq
from pydantic import BaseModel, Field
from supabase import Client, create_client

load_dotenv()

SUPABASE_URL = os.environ.get("SUPABASE_URL")
SUPABASE_KEY = (
    os.environ.get("SUPABASE_KEY")
    or os.environ.get("SUPABASE_API_KEY")
    or os.environ.get("SUPABASE_ANON_KEY")
    or os.environ.get("SUPABASE_PUBLISHABLE_KEY")
)
GROQ_API_KEY = os.environ.get("GROQ_API_KEY")
if not SUPABASE_URL or not SUPABASE_KEY or not GROQ_API_KEY:
    raise RuntimeError("SUPABASE_URL, SUPABASE_KEY, and GROQ_API_KEY are required")

app = FastAPI(title="groq.chat API")
frontend_origins = ",".join(
    filter(
        None,
        [
            os.getenv("FRONTEND_ORIGINS"),
            os.getenv("FRONTEND_ORIGIN"),
            "https://chatbot-4ebf.onrender.com",
            "http://localhost:5173",
        ],
    )
)
allowed_origins = [
    origin.strip()
    for origin in frontend_origins.split(",")
    if origin.strip()
]
app.add_middleware(
    CORSMiddleware,
    allow_origins=allowed_origins,
    allow_credentials=True,
    allow_methods=["GET", "POST", "OPTIONS"],
    allow_headers=["*"],
)

supabase: Client = create_client(SUPABASE_URL, SUPABASE_KEY)
groq = Groq(api_key=GROQ_API_KEY)
MODEL = "openai/gpt-oss-20b"


@app.get("/")
def root() -> dict:
    return {"service": "groq.chat API", "status": "ok", "docs": "/docs"}


class ChatRequest(BaseModel):
    message: str = Field(min_length=1, max_length=12000)
    conversation_id: str | None = None


def conversation_row(row: dict) -> dict:
    return {
        "id": row["id"],
        "title": row.get("title", "New conversation"),
        "created_at": row.get("created_at"),
        "updated_at": row.get("updated_at"),
    }


def get_conversation(conversation_id: str) -> dict | None:
    result = supabase.table("conversations").select("*").eq("id", conversation_id).maybe_single().execute()
    return conversation_row(result.data) if result.data else None


@app.get("/api/health")
def health() -> dict:
    return {"ok": True, "model": MODEL}


@app.get("/api/conversations")
def list_conversations() -> list[dict]:
    result = supabase.table("conversations").select("*").order("updated_at", desc=True).execute()
    return [conversation_row(row) for row in (result.data or [])]


@app.get("/api/conversations/{conversation_id}/messages")
def list_messages(conversation_id: str) -> list[dict]:
    try:
        UUID(conversation_id)
    except ValueError as error:
        raise HTTPException(status_code=400, detail="Invalid conversation id") from error
    result = supabase.table("messages").select("role, content, created_at").eq("conversation_id", conversation_id).order("created_at").execute()
    return result.data or []


@app.post("/api/chat")
def chat(payload: ChatRequest) -> dict:
    content = payload.message.strip()
    if not content:
        raise HTTPException(status_code=400, detail="Message cannot be empty")

    conversation = get_conversation(payload.conversation_id) if payload.conversation_id else None
    if payload.conversation_id and not conversation:
        raise HTTPException(status_code=404, detail="Conversation not found")
    if not conversation:
        title = content[:60] + ("..." if len(content) > 60 else "")
        created = supabase.table("conversations").insert({"title": title}).execute()
        conversation = conversation_row(created.data[0])
        conversation_id = conversation["id"]
    else:
        conversation_id = conversation["id"]

    previous = supabase.table("messages").select("role, content").eq("conversation_id", conversation_id).order("created_at").execute()
    chat_messages = (previous.data or []) + [{"role": "user", "content": content}]
    completion = groq.chat.completions.create(model=MODEL, messages=chat_messages, temperature=0.7, max_tokens=2048)
    assistant_content = completion.choices[0].message.content or "I wasn't able to generate a response."

    supabase.table("messages").insert([
        {"conversation_id": conversation_id, "role": "user", "content": content},
        {"conversation_id": conversation_id, "role": "assistant", "content": assistant_content},
    ]).execute()
    updated_at = datetime.now(timezone.utc).isoformat()
    refreshed = supabase.table("conversations").update({"updated_at": updated_at}).eq("id", conversation_id).execute()
    conversation = conversation_row(refreshed.data[0] if refreshed.data else {**conversation, "updated_at": updated_at})
    return {"conversation": conversation, "message": {"role": "assistant", "content": assistant_content}}


if __name__ == "__main__":
    import uvicorn

    uvicorn.run("main:app", host="0.0.0.0", port=int(os.getenv("PORT", "8000")), reload=True)
