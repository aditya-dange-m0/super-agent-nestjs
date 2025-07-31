# PGVector Service

This service provides vector storage capabilities using PGVector (PostgreSQL with vector extension) instead of Pinecone. It maintains the same interface as the Pinecone service for seamless migration.

## Features

- Vector embedding generation using OpenAI's text-embedding-3-small model
- Tool ingestion with metadata storage
- Semantic search for relevant tools based on natural language queries
- Namespace isolation using appKey metadata filtering
- Batch processing for efficient operations

## Environment Variables

Add these to your `.env` file:

```env
POSTGRES_CONNECTION_STRING=postgresql://user:password@host:5432/dbname
OPENAI_API_KEY=sk-your-openai-api-key
```

## Usage

### 1. Import the Module

```typescript
import { PgVectorModule } from './PgVector/pgvector.module';

@Module({
  imports: [PgVectorModule],
  // ... other module configuration
})
export class AppModule {}
```

### 2. Inject the Service

```typescript
import { PgVectorService } from './PgVector/pgvector.service';

@Injectable()
export class YourService {
  constructor(private pgVectorService: PgVectorService) {}
}
```

### 3. Ingest Tools

```typescript
const tools = {
  sendEmail: {
    description: 'Send an email to a recipient',
    parameters: {
      // ... tool parameters
    }
  },
  readInbox: {
    description: 'Read the latest emails from the inbox',
    parameters: {
      // ... tool parameters
    }
  }
};

await this.pgVectorService.ingestComposioAppToolsToPinecone('GMAIL', tools);
```

### 4. Search for Tools

```typescript
const relevantTools = await this.pgVectorService.getComposioAppToolsFromPinecone(
  'GMAIL',
  'How do I send a message?',
  3
);
console.log(relevantTools); // ['sendEmail']
```

## Migration from Pinecone

The service maintains the same method signatures as the Pinecone service:

- `ingestComposioAppToolsToPinecone()` - Same interface, stores in PGVector
- `getComposioAppToolsFromPinecone()` - Same interface, queries PGVector
- `generateEmbedding()` - Same interface, uses OpenAI embeddings

## Database Setup

Ensure your PostgreSQL database has the `pgvector` extension installed:

```sql
CREATE EXTENSION IF NOT EXISTS vector;
```

## Dependencies

- `@mastra/pg` - PGVector client
- `@ai-sdk/openai` - OpenAI SDK for embeddings
- `ai` - AI SDK utilities
- `@nestjs/config` - Configuration management 