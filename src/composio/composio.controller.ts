import { Controller, Post, Body, HttpException, HttpStatus } from '@nestjs/common';
import { ComposioService } from './composio.service';
import { ComposioInitiateDto } from './dto/composio-initiate.dto';
import { ComposioCallbackDto } from './dto/composio-callback.dto';

@Controller('composio')
export class ComposioController {
  constructor(private readonly composioService: ComposioService) {}

  @Post('callback')
  async handleCallback(@Body() body: ComposioCallbackDto) {
    try {
      const { connectedAccountId } = body;
      const activeConnection = await this.composioService.getComposioConnectionStatus(connectedAccountId);
      
      console.log("connection.status: ", activeConnection.status);

      return {
        success: true,
        id: activeConnection.id,
        status: activeConnection.status
      };
    } catch (error) {
      console.error(error);
      const errorMessage = error instanceof Error ? error.message : String(error);
      
      throw new HttpException(
        `Failed to activate connection: ${errorMessage}`,
        HttpStatus.INTERNAL_SERVER_ERROR
      );
    }
  }

  @Post('initiate')
  async initiateConnection(@Body() body: ComposioInitiateDto) {
    try {
      const { appName } = body;
      const userId = "984bf230-6866-45de-b610-a08b61aaa6ef"; // Move to config service

      console.log(
        `Received connection initiation request for app: ${appName}, user session: ${userId}`
      );

      const connectionRequest = await this.composioService.initiateComposioConnection(userId, appName);

      console.log(`Connected Account ID: ${connectionRequest.connectedAccountId}`);

      if (connectionRequest.redirectUrl) {
        return {
          success: true,
          redirectUrl: connectionRequest.redirectUrl,
          connectedAccountId: connectionRequest.connectedAccountId,
        };
      } else {
        console.warn(
          "Composio did not return a redirectUrl. This might indicate an immediate connection or an issue."
        );
        return {
          success: true,
          message: "Connection initiated without a redirect.",
          connectedAccountId: connectionRequest.connectedAccountId,
        };
      }
    } catch (error) {
      console.error("[COMPOSIO/INITIATE] Error:", error);
      const errorMessage = error instanceof Error ? error.message : "An unknown error occurred.";
      
      throw new HttpException(
        `Failed to initiate connection: ${errorMessage}`,
        HttpStatus.INTERNAL_SERVER_ERROR
      );
    }
  }
}
