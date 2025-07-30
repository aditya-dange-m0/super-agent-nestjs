// src/app-connections/app-connections.service.ts
import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { ComposioService } from '../composio/composio.service';

@Injectable()
export class AppConnectionsService {
  private readonly logger = new Logger(AppConnectionsService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly composioService: ComposioService,
  ) {}

  async connectApp(userId: string, appName: string, accountId: string, metadata?: any) {
    try {
      const connection = await this.prisma.appConnection.upsert({
        where: { userId_appName: { userId, appName } },
        update: {
          accountId,
          status: 'ACTIVE',
          metadata,
          updatedAt: new Date(),
        },
        create: {
          userId,
          appName,
          accountId,
          status: 'ACTIVE',
          metadata,
        },
      });
      this.logger.log(`App ${appName} connected for user ${userId}`);
      return connection;
    } catch (error) {
      this.logger.error(`Error connecting app ${appName} for user ${userId}:`, error);
      throw error;
    }
  }

  async getUserConnections(userId: string) {
    return await this.prisma.appConnection.findMany({
      where: { userId, status: 'ACTIVE' },
      select: { appName: true, accountId: true, status: true },
    });
  }

  // Check if a connection exists for a particular user and app
  async isAppConnected(userId: string, appName: string): Promise<boolean> {
    const connection = await this.prisma.appConnection.findUnique({
      where: { userId_appName: { userId, appName } },
      select: { status: true },
    });
    return !!connection && connection.status === 'ACTIVE';
  }

  async disconnectApp(userId: string, appName: string) {
    try {
      await this.prisma.appConnection.update({
        where: { userId_appName: { userId, appName } },
        data: { status: 'INACTIVE', updatedAt: new Date() }
      });
      this.logger.log(`App ${appName} disconnected for user ${userId}`);
    } catch (error) {
      this.logger.error(`Error disconnecting app ${appName} for user ${userId}:`, error);
      throw error;
    }
  }

  async syncConnectionStatus(userId: string, appName: string) {
    try {
      const connection = await this.prisma.appConnection.findUnique({
        where: { userId_appName: { userId, appName } }
      });

      if (connection) {
        const status = await this.composioService.getComposioConnectionStatus(connection.accountId);
        
        await this.prisma.appConnection.update({
          where: { id: connection.id },
          data: { 
            status: status.status,
            metadata: { ...connection, lastSync: new Date() },
            updatedAt: new Date()
          }
        });

        return status;
      }
    } catch (error) {
      this.logger.error(`Error syncing connection status for ${appName}:`, error);
      throw error;
    }
  }
}
