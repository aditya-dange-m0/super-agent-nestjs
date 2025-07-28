import { Injectable, Logger } from '@nestjs/common';

@Injectable()
export class ExecutionContextService {
  private readonly logger = new Logger(ExecutionContextService.name);
  private stepResults: Map<string, any> = new Map();
  private executionLog: string[] = [];

  addStepResult(stepId: string, result: any): void {
    this.stepResults.set(stepId, result);
    this.executionLog.push(`Step ${stepId}: ${this.truncateResult(result)}`);
    this.logger.log(`Added step ${stepId} result: ${this.truncateResult(result)}`);
  }

  private truncateResult(result: any): string {
    if (typeof result === "string") {
      return result.length > 100 ? result.substring(0, 100) + "..." : result;
    }
    try {
      const jsonString = JSON.stringify(result);
      return jsonString.length > 100 ? jsonString.substring(0, 100) + "..." : jsonString;
    } catch (e) {
      return "[Unstringifiable Object]";
    }
  }

  getStepResult(stepId: string): any {
    const result = this.stepResults.get(stepId);
    this.logger.log(`Retrieved step ${stepId} result: ${this.truncateResult(result)}`);
    return result;
  }

  getExecutionSummary(): string {
    const summary = this.executionLog.join(" → ");
    this.logger.log(`Full execution summary: ${summary}`);
    return summary;
  }

  enrichParametersWithContext(parameters: any): any {
    if (!parameters || typeof parameters !== "object") {
      return parameters;
    }

    const enriched = { ...parameters };
    let changed = false;
    for (const [key, value] of Object.entries(enriched)) {
      if (typeof value === "string" && value.startsWith("$step_")) {
        const stepId = value.substring(6);
        const stepResult = this.getStepResult(stepId);
        if (stepResult !== undefined) {
          enriched[key] = stepResult;
          changed = true;
          this.logger.log(`Enriched parameter '${key}' with result from step ${stepId}.`);
        } else {
          this.logger.warn(`Could not enrich parameter '${key}': Step ${stepId} result not found.`);
        }
      }
    }
    
    if (changed) {
      this.logger.log(`Parameters enriched. Original: ${JSON.stringify(parameters)}, Enriched: ${JSON.stringify(enriched)}`);
    }
    
    return enriched;
  }

  clearContext(): void {
    this.stepResults.clear();
    this.executionLog = [];
    this.logger.log('Execution context cleared');
  }
}
