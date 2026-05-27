import os
from dotenv import load_dotenv
from langchain_text_splitters import RecursiveCharacterTextSplitter
from langchain_openai import OpenAIEmbeddings
from langchain_qdrant import QdrantVectorStore
from langchain_core.documents import Document  

load_dotenv()

def load_markdown_docs(folder="../rag_data"):
    docs = []

    for file in os.listdir(folder):
        if file.endswith(".md"):
            with open(os.path.join(folder, file), "r") as f:
                text = f.read()

                docs.append(
                    Document(
                        page_content=text,
                        metadata={"source": file}
                    )
                )

    return docs

def index_docs():
    print("🚀 Indexing started...")

    docs = load_markdown_docs()

    splitter = RecursiveCharacterTextSplitter(
        chunk_size=500,
        chunk_overlap=100
    )

    chunks = splitter.split_documents(docs)

    embedding = OpenAIEmbeddings(
        model="text-embedding-3-small"
    )

    QdrantVectorStore.from_documents(
        documents=chunks,
        embedding=embedding,
        url="http://localhost:6333",
        collection_name="chatty_docs"
    )

    print("✅ Documents indexed successfully!")

if __name__ == "__main__":
    index_docs()