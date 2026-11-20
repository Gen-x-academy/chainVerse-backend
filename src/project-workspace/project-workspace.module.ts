import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { PrivateNote, PrivateNoteSchema } from './schemas/private-note.schema';
import { ProjectNote, ProjectNoteSchema } from './schemas/project-note.schema';
import {
  ProjectResource,
  ProjectResourceSchema,
} from './schemas/project-resource.schema';
import {
  ProjectWorkspace,
  ProjectWorkspaceSchema,
} from './schemas/project-workspace.schema';
import {
  WorkspaceActivity,
  WorkspaceActivitySchema,
} from './schemas/workspace-activity.schema';
import { PrivateNotesController } from './controllers/private-notes.controller';
import { ProjectNotesController } from './controllers/project-notes.controller';
import { ProjectWorkspaceController } from './controllers/project-workspace.controller';
import { ResourceLibraryController } from './controllers/resource-library.controller';
import { PrivateNoteCipher } from './support/private-note-cipher';
import { PrivateNoteService } from './services/private-note.service';
import { ProjectNoteService } from './services/project-note.service';
import { ProjectWorkspaceService } from './services/project-workspace.service';
import { ResourceLibraryService } from './services/resource-library.service';
import { WorkspaceAccessService } from './services/workspace-access.service';
import { WorkspaceActivityService } from './services/workspace-activity.service';

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: ProjectWorkspace.name, schema: ProjectWorkspaceSchema },
      { name: ProjectNote.name, schema: ProjectNoteSchema },
      { name: PrivateNote.name, schema: PrivateNoteSchema },
      { name: ProjectResource.name, schema: ProjectResourceSchema },
      { name: WorkspaceActivity.name, schema: WorkspaceActivitySchema },
    ]),
  ],
  controllers: [
    ProjectWorkspaceController,
    ProjectNotesController,
    PrivateNotesController,
    ResourceLibraryController,
  ],
  providers: [
    WorkspaceAccessService,
    WorkspaceActivityService,
    ProjectWorkspaceService,
    ProjectNoteService,
    PrivateNoteService,
    ResourceLibraryService,
    PrivateNoteCipher,
  ],
  exports: [
    WorkspaceAccessService,
    ProjectWorkspaceService,
    ProjectNoteService,
    PrivateNoteService,
    ResourceLibraryService,
  ],
})
export class ProjectWorkspaceModule {}
