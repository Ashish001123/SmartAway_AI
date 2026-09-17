# Advanced Details

## Technical Stack
SmartWay AI is a full-stack real-time chat application built with modern web technologies:
- **Frontend**: React.js, TailwindCSS (for styling), Zustand (for global state management).
- **Backend**: Node.js and Express.js, providing RESTful APIs.
- **Database**: MongoDB for storing messages, user profiles, and session data.
- **Real-time Communication**: Socket.io enables instant message delivery and online status updates without refreshing.

## AI Assistant Architecture
The AI Assistant integrated into SmartWay AI is designed to provide immediate help:
- It uses **OpenAI** language models globally to handle user intents.
- Internal documentation is stored inside a **Qdrant Vector Database** via Retrieval-Augmented Generation (RAG).
- The AI maintains a **Long-Term Memory** via the `mem0` client, allowing it to remember specific user preferences, names, and past interactions across sessions securely linked to their user ID.

## Unique Features
- **Real-time Online Indicators**: See exactly when your friends come online via websocket events.
- **Profile Customization**: Users can seamlessly update their names and profile pictures.
- **Instant AI Help**: Just ask the AI Assistant anything about the platform's features, or greet it!
