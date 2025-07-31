import { Injectable, Logger } from '@nestjs/common';
import { CacheService } from '../../cache/cache.service';
import { PineconeService } from '../../pinecone/pinecone.service';
import { ComposioService } from '../../composio/composio.service';
import { LlmRouterService } from '../../llm-router/llm-router.service';
import { ComprehensiveAnalysis } from '../interfaces/chat.interfaces';
import { AppConnectionDbService } from 'src/database/services/app-connection-db.service';

@Injectable()
export class ToolPreparationService {
  private readonly logger = new Logger(ToolPreparationService.name);

  // Mock connection mapping - replace with actual service
  // private readonly mockConnectedAccountMap: { [userId: string]: { [appName: string]: string } } = {
  //   "5f52cccd-77c8-4316-8da0-26a18fd01d7b": {
  //     GMAIL: "115d0196-f28c-482f-b6d8-360397eaa914",
  //     GOOGLECALENDAR: "16b0af21-36b8-43b5-a95c-055579703dba",
  //     GOOGLEDRIVE: "mock_drive_conn_id_user1_abc",
  //     NOTION: "mock_notion_conn_id_user1_xyz",
  //     GOOGLEDOCS: "fdca6517-b833-4a56-bc07-9bb8c70fa751",
  //   },
  //   "984bf230-6866-45de-b610-a08b61aaa6ef": {
  //     GMAIL: "115d0196-f28c-482f-b6d8-360397eaa914",
  //     GOOGLECALENDAR: "16b0af21-36b8-43b5-a95c-055579703dba",
  //     GOOGLEDRIVE: "mock_drive_conn_id_user2_def",
  //     NOTION: "mock_notion_conn_id_user2_uvw",
  //     GOOGLEDOCS: "7d7fa0ba-882e-4554-b1bc-2b9c4fe42926",
  //   },
  // };

  constructor(
    private readonly cacheService: CacheService,
    private readonly PineconeService: PineconeService,
    private readonly composioService: ComposioService,
    private readonly LlmRouterService: LlmRouterService,
    private readonly appConnectionDbService: AppConnectionDbService,
  ) {}

  async prepareToolsForExecution(
    analysis: ComprehensiveAnalysis,
    userQuery: string,
    userId: string,
    initialToolNames: string[],
  ): Promise<{ tools: any; requiredConnections: string[] }> {
    const { recommendedApps, toolPriorities } = analysis;

    this.logger.log(
      `Starting tool preparation. Recommended Apps from Analysis: ${JSON.stringify(recommendedApps)}. Initial Tool Names from Routing: ${JSON.stringify(initialToolNames)}`,
    );

    if (recommendedApps.length === 0) {
      this.logger.log(
        'No recommended apps from analysis. Returning empty tools.',
      );
      return { tools: {}, requiredConnections: [] };
    }

    // Get app routing with caching
    let appNames = await this.cacheService.getCachedAppRouting(userQuery);
    if (!appNames) {
      try {
        this.logger.log('Fetching app routing from service...');
        const { appNames: routedApps } =
          await this.LlmRouterService.routeAppsWithLLM(userQuery);
        appNames = routedApps;
        await this.cacheService.setCachedAppRouting(userQuery, appNames);
        this.logger.log(
          `App routing service returned: ${JSON.stringify(appNames)}`,
        );
      } catch (error) {
        this.logger.warn(
          'App routing service error, using analysis recommendations:',
          error,
        );
        appNames = recommendedApps;
      }
    } else {
      this.logger.log(`Using cached app routing: ${JSON.stringify(appNames)}`);
    }

    // Prioritize apps based on analysis
    const prioritizedApps = appNames
      .map((app) => ({
        name: app,
        priority: toolPriorities.find((p) => p.appName === app)?.priority || 5,
      }))
      .sort((a, b) => b.priority - a.priority)
      .slice(0, 3) // Limit to top 3 apps for performance
      .map((app) => app.name);

    this.logger.log(
      `Prioritized apps for execution (top 3): ${JSON.stringify(prioritizedApps)}`,
    );

    let fetchedComposioTools: any = {};
    const appsNeedingConnection: string[] = [];

    // Process apps in parallel for better performance
    const toolPromises = prioritizedApps.map(async (appName) => {
      this.logger.log(`Processing app: ${appName}`);
      const connectedAccountId = await this.getConnectedAccountIdForUserAndApp(
        userId,
        appName,
      );

      if (!connectedAccountId) {
        appsNeedingConnection.push(appName);
        this.logger.warn(`App ${appName} is NOT connected for user ${userId}.`);
        return null;
      }

      this.logger.log(
        `App ${appName} has connected account ID: ${connectedAccountId}`,
      );

      // Check connection status with caching
      let connectionStatus =
        await this.cacheService.getCachedConnectionStatus(connectedAccountId);
      if (!connectionStatus) {
        this.logger.log(
          `Fetching connection status for ${appName} (${connectedAccountId})...`,
        );
        connectionStatus =
          await this.composioService.getComposioConnectionStatus(
            connectedAccountId,
          );
        await this.cacheService.setCachedConnectionStatus(
          connectedAccountId,
          connectionStatus,
        );
        this.logger.log(
          `Connection status for ${appName}: ${JSON.stringify(connectionStatus.status)}`,
        );
      } else {
        this.logger.log(
          `Using cached connection status for ${appName}: ${JSON.stringify(connectionStatus.status)}`,
        );
      }

      if (
        connectionStatus.status !== 'INITIATED' &&
        connectionStatus.status !== 'ACTIVE'
      ) {
        appsNeedingConnection.push(appName);
        this.logger.warn(
          `Composio reports ${appName} connection ${connectedAccountId} is NOT active/initiated. Skipping tool collection.`,
        );
        return null;
      }

      this.logger.log(`App ${appName} connection is ACTIVE.`);

      // Prioritize initialToolNames for fetching tools
      let toolsToFetchForApp: string[] = [];
      const specificToolsFromRouting = initialToolNames.filter((t) =>
        t.startsWith(`${appName}_`),
      );

      if (specificToolsFromRouting.length > 0) {
        toolsToFetchForApp = specificToolsFromRouting;
        this.logger.log(
          `Using specific tool names from initial routing for ${appName}: ${JSON.stringify(toolsToFetchForApp)}`,
        );
      } else {
        // Fallback to semantic search
        let relevantTools = await this.cacheService.getCachedToolSearch(
          appName,
          userQuery,
        );
        if (!relevantTools) {
          try {
            this.logger.log(
              `Performing semantic search for tools in ${appName} with query: "${userQuery}"`,
            );
            relevantTools =
              await this.PineconeService.getComposioAppToolsFromPinecone(
                appName,
                userQuery,
                5,
              );
            await this.cacheService.setCachedToolSearch(
              appName,
              userQuery,
              relevantTools || [],
            );
            this.logger.log(
              `Semantic search for ${appName} returned: ${JSON.stringify(relevantTools)}`,
            );
          } catch (error) {
            this.logger.warn(`Semantic search error for ${appName}:`, error);
            relevantTools = [];
          }
        } else {
          this.logger.log(
            `Using cached relevant tools for ${appName}: ${JSON.stringify(relevantTools)}`,
          );
        }
        toolsToFetchForApp = relevantTools || [];
      }

      if (toolsToFetchForApp.length > 0) {
        try {
          this.logger.log(
            `Fetching full tool definitions for ${appName}: ${JSON.stringify(toolsToFetchForApp)}`,
          );
          // This would call your composio service to get actual tools
          const tools = await this.composioService.getComposioTool(
            toolsToFetchForApp,
            userId,
          );
          this.logger.log(
            `Fetched ${Object.keys(tools).length} tools for ${appName}.`,
          );
          return { appName, tools };
        } catch (error) {
          this.logger.error(
            `Error fetching full tool definitions for ${appName}:`,
            error,
          );
          return null;
        }
      }

      this.logger.log(`No relevant tools found or fetched for ${appName}.`);
      return null;
    });

    // Wait for all tool fetching to complete
    const toolResults = await Promise.allSettled(toolPromises);

    toolResults.forEach((result) => {
      if (result.status === 'fulfilled' && result.value) {
        fetchedComposioTools = {
          ...fetchedComposioTools,
          ...result.value.tools,
        };
      }
    });

    this.logger.log(
      `Total tools prepared for LLM: ${Object.keys(fetchedComposioTools).length}`,
    );
    this.logger.log(
      `Apps requiring connection: ${JSON.stringify(appsNeedingConnection)}`,
    );

    return {
      tools: fetchedComposioTools,
      requiredConnections: appsNeedingConnection,
    };
  }

  // Replace the mock connection lookup with a real DB/service call
  private async getConnectedAccountIdForUserAndApp(
    userId: string,
    appName: string,
  ): Promise<string | undefined> {
    const connection = await this.appConnectionDbService.getConnection(
      userId,
      appName,
    );
    if (connection && connection.status === 'ACTIVE') {
      return connection.accountId;
    }
    return undefined;
  }
}
