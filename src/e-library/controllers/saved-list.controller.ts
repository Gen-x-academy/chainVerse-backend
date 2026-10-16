import { Body, Controller, Delete, Get, Param, Post, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiParam, ApiResponse, ApiTags } from '@nestjs/swagger';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { Roles } from '../../common/decorators/roles.decorator';
import { Role } from '../../common/enums/role.enum';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { SavedListService } from '../services/saved-list.service';
import { CreateSavedListDto, AddItemToListDto } from '../dto/saved-list.dto';

@ApiTags('E-Library Discovery')
@ApiBearerAuth('access-token')
@UseGuards(JwtAuthGuard, RolesGuard)
@Controller(['library/lists', 'v1/library/lists'])
export class SavedListController {
  constructor(private readonly savedListService: SavedListService) {}

  @Post()
  @Roles(Role.STUDENT, Role.TUTOR)
  @ApiOperation({ summary: 'Create a new saved list' })
  @ApiResponse({ status: 201, description: 'List created' })
  @ApiResponse({ status: 409, description: 'List name already exists or limit reached' })
  createList(
    @CurrentUser('sub') patronId: string,
    @Body() dto: CreateSavedListDto,
  ) {
    return this.savedListService.createList(patronId, dto);
  }

  @Get()
  @Roles(Role.STUDENT, Role.TUTOR)
  @ApiOperation({ summary: "List the caller's saved lists" })
  listLists(@CurrentUser('sub') patronId: string) {
    return this.savedListService.listLists(patronId);
  }

  @Get(':listId')
  @Roles(Role.STUDENT, Role.TUTOR)
  @ApiOperation({ summary: 'Get a specific list with items' })
  @ApiParam({ name: 'listId', description: 'List ID' })
  getList(
    @Param('listId') listId: string,
    @CurrentUser('sub') patronId: string,
  ) {
    return this.savedListService.getList(listId, patronId);
  }

  @Post(':listId/items')
  @Roles(Role.STUDENT, Role.TUTOR)
  @ApiOperation({ summary: 'Add a book to a list' })
  @ApiParam({ name: 'listId', description: 'List ID' })
  @ApiResponse({ status: 201, description: 'Item added' })
  @ApiResponse({ status: 409, description: 'Item already in list or limit reached' })
  addItem(
    @Param('listId') listId: string,
    @CurrentUser('sub') patronId: string,
    @Body() dto: AddItemToListDto,
  ) {
    return this.savedListService.addItem(listId, patronId, dto);
  }

  @Delete(':listId/items/:bookId')
  @Roles(Role.STUDENT, Role.TUTOR)
  @ApiOperation({ summary: 'Remove a book from a list' })
  @ApiParam({ name: 'listId', description: 'List ID' })
  @ApiParam({ name: 'bookId', description: 'Book ID' })
  removeItem(
    @Param('listId') listId: string,
    @Param('bookId') bookId: string,
    @CurrentUser('sub') patronId: string,
  ) {
    return this.savedListService.removeItem(listId, patronId, bookId);
  }

  @Delete(':listId')
  @Roles(Role.STUDENT, Role.TUTOR)
  @ApiOperation({ summary: 'Delete a saved list' })
  @ApiParam({ name: 'listId', description: 'List ID' })
  deleteList(
    @Param('listId') listId: string,
    @CurrentUser('sub') patronId: string,
  ) {
    return this.savedListService.deleteList(listId, patronId);
  }
}
