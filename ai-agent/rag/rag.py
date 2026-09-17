import os
import time
from pathlib import Path

from dotenv import load_dotenv

load_dotenv()

QDRANT_URL = os.getenv("QDRANT_URL", "http://localhost:6333")
COLLECTION_NAME = "chatty_docs"
DOCS_DIR = Path(__file__).resolve().parent.parent / "rag_data"
QDRANT_RETRY_SECS = 300

_vector_db = None
_last_qdrant_failure = 0.0
_local_docs = None


def _get_vector_db():
    global _vector_db, _last_qdrant_failure
    if _vector_db is not None:
        return _vector_db
    if time.time() - _last_qdrant_failure < QDRANT_RETRY_SECS:
        return None
    try:
        from langchain_openai import OpenAIEmbeddings
        from langchain_qdrant import QdrantVectorStore

        _vector_db = QdrantVectorStore.from_existing_collection(
            embedding=OpenAIEmbeddings(model="text-embedding-3-small"),
            url=QDRANT_URL,
            collection_name=COLLECTION_NAME,
        )
        return _vector_db
    except Exception as e:
        _last_qdrant_failure = time.time()
        print(f"⚠️  Qdrant unavailable, answering from local docs: {e}")
        return None


def _get_local_docs():
    global _local_docs
    if _local_docs is None:
        _local_docs = [path.read_text(encoding="utf-8") for path in sorted(DOCS_DIR.glob("*.md"))]
    return _local_docs


def retrieve(query: str, k=8):
    vector_db = _get_vector_db()
    if vector_db is not None:
        try:
            results = vector_db.similarity_search(query, k=k)
            if results:
                return [doc.page_content for doc in results]
        except Exception as e:
            print("❌ RAG ERROR:", e)

    # The docs are only a few KB, so without a vector store (e.g. on Render) we send them all as context
    return _get_local_docs()
