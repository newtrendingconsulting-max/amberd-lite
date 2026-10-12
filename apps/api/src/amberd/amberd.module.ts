import { Module } from '@nestjs/common';
import { PrismaModule } from '../prisma/prisma.module';
import { OrganizationsModule } from '../organizations/organizations.module';
import { NotificationsModule } from '../notifications/notifications.module';
import { EmailModule } from '../email/email.module';
import {
  GoogleDriveCallbackController,
  GoogleDriveConnectionController,
  GoogleDriveIntegrationService,
} from './connectors/google-drive.integration';
import { AmberdController } from './amberd.controller';
import { AmberdAccessService } from './amberd-access.service';
import { AmberdBootstrapService } from './amberd-bootstrap.service';
import { AgentsService } from './agents.service';
import { RunsService } from './runs.service';
import { PlatformService } from './platform.service';
import { ConnectionsService } from './connectors/connections.service';
import { LlmRegistryService } from './llm/llm-registry.service';
import { ExecutionEngineService } from './engine/execution-engine.service';

@Module({
  imports: [PrismaModule, OrganizationsModule, NotificationsModule, EmailModule],
  controllers: [AmberdController, GoogleDriveConnectionController, GoogleDriveCallbackController],
  providers: [
    AmberdAccessService,
    AmberdBootstrapService,
    AgentsService,
    RunsService,
    PlatformService,
    ConnectionsService,
    LlmRegistryService,
    ExecutionEngineService,
    GoogleDriveIntegrationService,
  ],
})
export class AmberdModule {}
