import { createReadStream } from 'fs';
import { createInterface } from 'readline';
import { PayerClaimSchema, type PayerClaim, createServiceLogger } from '@billing-simulator/shared';

const logger = createServiceLogger('file-reader');

export interface FileReaderOptions {
  filePath: string;
  onClaim: (claim: PayerClaim, lineNumber: number) => Promise<void>;
  onError: (error: Error, lineNumber: number, line: string) => void;
  onComplete: () => void;
}

export class ClaimsFileReader {
  private options: FileReaderOptions;
  private lineNumber = 0;
  private validClaims = 0;
  private invalidClaims = 0;

  constructor(options: FileReaderOptions) {
    this.options = options;
  }

  async start(): Promise<void> {
    logger.info(`Starting to read claims file: ${this.options.filePath}`);
    
    try {
      const fileStream = createReadStream(this.options.filePath, { encoding: 'utf8' });
      const rl = createInterface({
        input: fileStream,
        crlfDelay: Infinity, // Handle Windows line endings
      });

      rl.on('line', async (line) => {
        this.lineNumber++;
        await this.processLine(line.trim());
      });

      rl.on('close', () => {
        logger.info(`File reading complete. Processed ${this.lineNumber} lines, ${this.validClaims} valid claims, ${this.invalidClaims} invalid claims`);
        this.options.onComplete();
      });

      rl.on('error', (error) => {
        logger.error(`Error reading file: ${error.message}`);
        this.options.onError(error, this.lineNumber, '');
      });

    } catch (error) {
      const err = error instanceof Error ? error : new Error(String(error));
      logger.error(`Failed to open file ${this.options.filePath}: ${err.message}`);
      this.options.onError(err, 0, '');
    }
  }

  private async processLine(line: string): Promise<void> {
    // Skip empty lines
    if (line.length === 0) {
      return;
    }

    try {
      // Parse JSON
      const rawClaim = JSON.parse(line);
      
      // Validate against schema
      const validatedClaim = PayerClaimSchema.parse(rawClaim);
      
      this.validClaims++;
      await this.options.onClaim(validatedClaim, this.lineNumber);
      
    } catch (error) {
      this.invalidClaims++;
      const err = error instanceof Error ? error : new Error(String(error));
      
      if (error instanceof SyntaxError) {
        logger.warn(`Invalid JSON on line ${this.lineNumber}: ${err.message}`);
      } else {
        logger.warn(`Schema validation failed on line ${this.lineNumber}: ${err.message}`);
      }
      
      this.options.onError(err, this.lineNumber, line);
    }
  }

  getStats() {
    return {
      totalLines: this.lineNumber,
      validClaims: this.validClaims,
      invalidClaims: this.invalidClaims,
    };
  }
}