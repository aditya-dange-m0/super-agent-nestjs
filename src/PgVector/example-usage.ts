// Example usage of PGVector Service
// This file demonstrates how to use the PGVector service in your NestJS application

import { Injectable } from '@nestjs/common';
import { PgVectorService } from './pgvector.service';
import { ToolsObject } from '../types/types';

@Injectable()
export class ExampleService {
  constructor(private pgVectorService: PgVectorService) {}

  async exampleIngestTools() {
    // Example tools object
    const gmailTools: ToolsObject = {
      sendEmail: {
        description: 'Send an email to a recipient with subject and body',
        parameters: {
          jsonSchema: {
            properties: {
              to: {
                description: 'Email address of the recipient',
                title: 'To',
                type: 'string'
              },
              subject: {
                description: 'Subject line of the email',
                title: 'Subject',
                type: 'string'
              },
              body: {
                description: 'Body content of the email',
                title: 'Body',
                type: 'string'
              }
            },
            required: ['to', 'subject', 'body'],
            title: 'SendEmailParameters',
            type: 'object'
          }
        }
      },
      readInbox: {
        description: 'Read emails from the inbox with optional filters',
        parameters: {
          jsonSchema: {
            properties: {
              limit: {
                description: 'Number of emails to retrieve',
                title: 'Limit',
                type: 'number',
                default: 10
              },
              unreadOnly: {
                description: 'Only return unread emails',
                title: 'Unread Only',
                type: 'boolean',
                default: false
              }
            },
            required: [],
            title: 'ReadInboxParameters',
            type: 'object'
          }
        }
      }
    };

    // Ingest tools for Gmail app
    await this.pgVectorService.ingestComposioAppToolsToPinecone('GMAIL', gmailTools);
    console.log('Gmail tools ingested successfully');
  }

  async exampleSearchTools() {
    // Search for relevant tools based on natural language query
    const relevantTools = await this.pgVectorService.getComposioAppToolsFromPinecone(
      'GMAIL',
      'I want to send a message to someone',
      3
    );

    console.log('Relevant tools found:', relevantTools);
    // Expected output: ['sendEmail']

    // Search for reading tools
    const readingTools = await this.pgVectorService.getComposioAppToolsFromPinecone(
      'GMAIL',
      'Check my unread messages',
      2
    );

    console.log('Reading tools found:', readingTools);
    // Expected output: ['readInbox']
  }

  async exampleGenerateEmbedding() {
    // Generate embedding for a custom text
    const embedding = await this.pgVectorService.generateEmbedding(
      'This is a sample text for embedding generation'
    );

    console.log('Generated embedding length:', embedding.length);
    // Expected output: 1536 (for text-embedding-3-small model)
  }
}

// Module configuration example
/*
import { Module } from '@nestjs/common';
import { PgVectorModule } from './PgVector/pgvector.module';
import { ExampleService } from './example-usage';

@Module({
  imports: [PgVectorModule],
  providers: [ExampleService],
  exports: [ExampleService],
})
export class ExampleModule {}
*/ 