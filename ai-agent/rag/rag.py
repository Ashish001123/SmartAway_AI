from langchain_openai import OpenAIEmbeddings
from langchain_qdrant import QdrantVectorStore
from dotenv import load_dotenv

load_dotenv()

embedding = OpenAIEmbeddings(
    model="text-embedding-3-small"
)

def retrieve(query: str, k=8):
    try:
        vector_db = QdrantVectorStore.from_existing_collection(
            embedding=embedding,
            url="http://localhost:6333",
            collection_name="chatty_docs"
        )

        results = vector_db.similarity_search(query, k=k)

        return [doc.page_content for doc in results]

    except Exception as e:
        print("❌ RAG ERROR:", e)
        return []