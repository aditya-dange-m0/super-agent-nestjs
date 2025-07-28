// src/composio/composio.service.ts
import { Injectable } from '@nestjs/common';
import { VercelAIToolSet, ConnectionRequest } from 'composio-core';
import { v4 as uuidv4 } from 'uuid';

@Injectable()
export class ComposioService {
  // Private property to hold the VercelAIToolSet instance
  private readonly toolset: VercelAIToolSet;
  // Private property to store the Composio API key
  private readonly COMPOSIO_API_KEY: string;

  // Mock database for user connections (for POC purposes, replace with a real DB in production)
  private mockUserConnections: { [userId: string]: { [appName: string]: string } } = {};

  constructor() {
    // Initialize the API key from environment variables or use a default
    this.COMPOSIO_API_KEY = process.env.COMPOSIO_API_KEY || 'sh6ezs034ez0pxtd7akxs';

    // Log an error if the API key is not found
    if (!this.COMPOSIO_API_KEY) {
      console.error('No COMPOSIO_API_KEY found in environment variables.');
    }

    // Initialize the VercelAIToolSet with the API key
    this.toolset = new VercelAIToolSet({
      apiKey: this.COMPOSIO_API_KEY,
    });
  }

  /**
   * Generates a new UUID.
   * @returns A new UUID string.
   */
  private generateUUID(): string {
    return uuidv4();
  }

  /**
   * Saves a user's connected account ID for a specific application in the mock database.
   * @param userId The ID of the user.
   * @param appName The name of the application.
   * @param connectedAccountId The connected account ID to save.
   */
  private async saveUserConnection(
    userId: string,
    appName: string,
    connectedAccountId: string,
  ): Promise<void> {
    if (!this.mockUserConnections[userId]) {
      this.mockUserConnections[userId] = {};
    }
    this.mockUserConnections[userId][appName] = connectedAccountId;
    console.log(
      `[Mock DB] Saved connection for user '${userId}', app '${appName}': ${connectedAccountId}`,
    );
    console.log('Current mockUserConnections:', this.mockUserConnections);
  }

  /**
   * Retrieves a user's connected account ID for a specific application from the mock database.
   * @param userId The ID of the user.
   * @param appName The name of the application.
   * @returns The connected account ID or null if not found.
   */
  private async getUserConnection(
    userId: string,
    appName: string,
  ): Promise<string | null> {
    const connectedAccountId = this.mockUserConnections[userId]?.[appName] || null;
    console.log(
      `[Mock DB] Retrieved connection for user '${userId}', app '${appName}': ${
        connectedAccountId ? connectedAccountId : 'Not Found'
      }`,
    );
    return connectedAccountId;
  }

  /**
   * Initiates a connection request to a Composio application for a given user.
   * If userId is null, a new UUID will be generated for the session.
   * @param userId The user ID (session ID for POC) or null to generate a new one.
   * @param appName The name of the application to connect to (e.g., 'GMAIL', 'NOTION').
   * @returns A ConnectionRequest object containing redirect URL and connected account ID.
   * @throws Error if Composio API key is not configured or connection fails.
   */
  public async initiateComposioConnection(
    userId: string | null,
    appName: string,
  ): Promise<ConnectionRequest> {
    if (!this.COMPOSIO_API_KEY) {
      throw new Error(
        'Composio API key is not configured. Please set COMPOSIO_API_KEY environment variable.',
      );
    }

    // Use provided userId or generate a new one
    const entityId = userId || this.generateUUID();

    try {
      console.log(
        `Initiating connection to ${appName} for entity: '${entityId}'...`,
      );
      // Call the Composio API to initiate the connection
      const initialConnectedAccount = await this.toolset.connectedAccounts.initiate({
        appName: appName,
        entityId: entityId,
      });

      // Save the connected account ID if available
      if (initialConnectedAccount.connectedAccountId) {
        await this.saveUserConnection(
          entityId,
          appName,
          initialConnectedAccount.connectedAccountId,
        );
      }
      

      console.log(
        `Initiated Composio connection for ${appName} for user ${entityId}. Redirect URL: ${initialConnectedAccount.redirectUrl}`,
      );
      console.log(
        `------------------------------------------------------------------------------------------------------------------------`,
      );
      console.log(
        `Connected Account ID: ${initialConnectedAccount.connectedAccountId}`,
      );
      console.log(
        `------------------------------------------------------------------------------------------------------------------------`,
      );
      return initialConnectedAccount;
    } catch (error) {
      console.error(
        `Failed to initiate Composio connection for ${appName} and user ${entityId}:`,
        error,
      );
      throw new Error(
        `Failed to initiate connection: ${
          error instanceof Error ? error.message : String(error)
        }`,
      );
    }
  }

  /**
   * Retrieves the status of a specific Composio connection.
   * @param connectedAccountId The ID of the connected account.
   * @returns The connection status object.
   * @throws Error if Composio API key is not configured or status retrieval fails.
   */
  public async getComposioConnectionStatus(connectedAccountId: string) {
    if (!this.COMPOSIO_API_KEY) {
      throw new Error('Composio API key is not configured.');
    }
    try {
      // Call the Composio API to get the connection status
      const connection = await this.toolset.connectedAccounts.get({
        connectedAccountId,
      });
      return connection;
    } catch (error) {
      console.error(`Failed to get status for ${connectedAccountId}:`, error);
      throw new Error(
        `Failed to get connection status: ${
          error instanceof Error ? error.message : String(error)
        }`,
      );
    }
  }

  /**
   * Returns a static list of available Composio tools for the POC.
   * In a real application, this might be fetched dynamically.
   * @returns An array of tool objects with name, appName, description, and icon.
   */
  public async getAvailableComposioTools(): Promise<
    { name: string; appName: string; description: string; icon: string }[]
  > {
    // This list is static for the POC.
    return [
      {
        name: 'Google Super',
        appName: 'GOOGLESUPER',
        description:
          'Access your Google Workspace Suite, including Gmail, Calendar, Drive, and more.',
        icon: 'https://placehold.co/40x40/FF0000/FFFFFF?text=GS',
      },
      {
        name: 'Gmail',
        appName: 'GMAIL',
        description:
          'Access your Gmail inbox, read and send emails, and search through your messages.',
        icon: 'https://placehold.co/40x40/EA4335/FFFFFF?text=GM',
      },
      {
        name: 'Calendar',
        appName: 'GOOGLECALENDAR',
        description:
          'Manage your Google Calendar events, set up appointments, and check your schedule.',
        icon: 'https://placehold.co/40x40/4285F4/FFFFFF?text=GC',
      },
      {
        name: 'Drive',
        appName: 'GOOGLEDRIVE',
        description:
          'Access files stored in your Google Drive, upload documents, and share content.',
        icon: 'https://placehold.co/40x40/34A853/FFFFFF?text=GD',
      },
      {
        name: 'Notion',
        appName: 'NOTION',
        description:
          'Access your Notion pages, create and edit content, and manage your workspace.',
        icon: 'https://placehold.co/40x40/000000/FFFFFF?text=N',
      },
      {
        name: 'Docs',
        appName: 'GOOGLEDOCS',
        description:
          'Access files stored in your Google Drive, upload documents, and share content.',
        icon: 'https://placehold.co/40x40/34A853/FFFFFF?text=GD',
      },
    ];
  }

  /**
   * Fetches all available Composio tools for a specific application.
   * @param appName The name of the application (e.g., 'GMAIL').
   * @returns An object containing the fetched Composio tools.
   * @throws Error if Composio API key is not configured or tool fetching fails.
   */
  public async getComposioAppTools(appName: string): Promise<Object> {
    if (!this.COMPOSIO_API_KEY) {
      throw new Error('Composio API key is not configured.');
    }

    try {
      // Call the Composio API to get tools for the specified app
      const composioTools = await this.toolset.getTools({ apps: [appName] });
      console.log(`Fetched ${composioTools.length} tools for app: ${appName}`);
      return composioTools;
    } catch (error) {
      console.error(`Error fetching Composio tools for app ${appName}:`, error);
      throw new Error(
        `Failed to fetch Composio tools for ${appName}: ${
          error instanceof Error ? error.message : String(error)
        }`,
      );
    }
  }

  /**
   * Fetches specific Composio tools by their action names for a given user.
   * @param tools An array of tool action names (e.g., ['gmail.send_email']).
   * @param userId The user ID associated with the tools.
   * @returns An object containing the fetched Composio tools.
   * @throws Error if Composio API key is not configured or tool fetching fails.
   */
  public async getComposioTool(
    tools: string[],
    userId: string,
  ): Promise<Object> {
    if (!this.COMPOSIO_API_KEY) {
      throw new Error('Composio API key is not configured.');
    }

    try {
      // Call the Composio API to get specific tools by action names and user ID
      const fetchedTools = await this.toolset.getTools({ actions: tools }, userId);
      return fetchedTools;
    } catch (error) {
      console.error(`Error fetching Composio tools: `, error);
      throw new Error(
        `Failed to fetch Composio tools: ${
          error instanceof Error ? error.message : String(error)
        }`,
      );
    }
  }

  /**
   * Re-initiates or enables a Composio connection.
   * Note: The original `initiateComposioConnection` call inside this function
   * seems redundant if `connectedAccountId` is already known. This might need
   * review based on Composio's exact re-initiation flow.
   * @param connectedAccountId The ID of the connected account to enable.
   * @param appName The name of the application.
   * @returns The re-initiated connection ID.
   * @throws Error if connectedAccountId is not provided or re-initiation fails.
   */
  public async enableComposioConnection(
    connectedAccountId: string,
    appName: string,
  ) {
    if (!connectedAccountId) {
      throw new Error('Composio connectedAccountId is not configured.');
    }
    try {
      // This call to initiateComposioConnection with 'default' user might be
      // specific to your POC setup. In a real scenario, you might pass the
      // actual userId or handle the redirectUri differently.
      const result = await this.initiateComposioConnection('default', appName);
      const connectedID = await this.toolset.connectedAccounts.reinitiateConnection({
        connectedAccountId,
        data: {}, // Additional data if required for re-initiation
        redirectUri: result.redirectUrl || undefined, // Use the redirect URL from the initial connection
      });
      return connectedID;
    } catch (error) {
      console.error(`Error enabling Composio connection for app ${appName}:`, error);
      throw new Error(
        `Failed to enable Composio connection for app ${appName}: ${
          error instanceof Error ? error.message : String(error)
        }`,
      );
    }
  }

  /**
   * Executes a specific Composio action using a given connected account.
   * @param userId The user ID associated with the action.
   * @param connectedAccountId The ID of the connected account to use for execution.
   * @param action The name of the action to execute (e.g., 'gmail.send_email').
   * @param params Parameters for the action.
   * @returns The result data from the executed action.
   * @throws Error if Composio API key is not configured or action execution fails.
   */
  public async executeComposioAction(
    userId: string,
    connectedAccountId: string,
    action: string,
    params: any = {},
  ): Promise<any> {
    if (!this.COMPOSIO_API_KEY) {
      throw new Error('Composio API key is not configured.');
    }

    try {
      console.log(
        `Executing Composio action '${action}' for user ${userId} using connection ${connectedAccountId} with params:`,
        params,
      );
      // Execute the action using the specific connectedAccountId and entityId
      const result = await this.toolset.executeAction({
        action: action,
        params: params,
        connectedAccountId: connectedAccountId,
        entityId: userId,
      });

      if (!result.successful) {
        console.error(
          `Composio action '${action}' failed for user ${userId} and connection ${connectedAccountId}:`,
          result.error,
        );
        throw new Error(
          `Composio action failed: ${result.error || 'Unknown error'}`,
        );
      }

      console.log(
        `Composio action '${action}' successful for user ${userId} and connection ${connectedAccountId}.`,
      );
      return result.data;
    } catch (error) {
      console.error(
        `Error executing Composio action '${action}' for user ${userId} and connection ${connectedAccountId}:`,
        error,
      );
      throw new Error(
        `Error during action execution: ${
          error instanceof Error ? error.message : String(error)
        }`,
      );
    }
  }
}
