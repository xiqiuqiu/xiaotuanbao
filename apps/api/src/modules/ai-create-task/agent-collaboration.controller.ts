import { Body, Controller, Get, HttpCode, Param, Post, Query, Req, UseGuards } from '@nestjs/common'
import type {
  DepartureCollaborationView,
  ReviewConfirmationView,
  ReviewRevisionView,
} from '@xiaotuanbao/shared'
import { RequireMenu } from '../../common/decorators/require-menu.decorator'
import { MenuPermissionGuard } from '../../common/guards/menu-permission.guard'
import { JwtAuthGuard } from '../auth/jwt-auth.guard'
import { AcceptReviewConfirmationDto } from './dto/ai-create-task.dto'
import { ReviewCollaborationService } from './review-collaboration.service'

@Controller('agent')
@UseGuards(JwtAuthGuard, MenuPermissionGuard)
export class AgentCollaborationController {
  constructor(private readonly collaboration: ReviewCollaborationService) {}

  @Post('review-decisions')
  @HttpCode(200)
  @RequireMenu('departure:write')
  acceptConfirmation(
    @Req() request: { user: { organizationId: string; userId: string } },
    @Body() dto: AcceptReviewConfirmationDto,
  ): Promise<ReviewConfirmationView> {
    return this.collaboration.acceptReviewConfirmation(
      request.user.organizationId,
      request.user.userId,
      dto,
    )
  }

  @Get('review-decisions/:decisionCommandId')
  @RequireMenu('/departure')
  getConfirmation(
    @Req() request: { user: { organizationId: string; userId: string } },
    @Param('decisionCommandId') decisionCommandId: string,
  ): Promise<ReviewConfirmationView> {
    return this.collaboration.getReviewConfirmation(
      request.user.organizationId,
      request.user.userId,
      decisionCommandId,
    )
  }

  @Get('departures/:departureId/collaboration')
  @RequireMenu('/departure')
  listCollaboration(
    @Req() request: { user: { organizationId: string; userId: string } },
    @Param('departureId') departureId: string,
    @Query('conversationId') conversationId?: string,
  ): Promise<DepartureCollaborationView> {
    return this.collaboration.listDepartureCollaboration(
      request.user.organizationId,
      request.user.userId,
      departureId,
      conversationId,
    )
  }

  @Get('review-packages/:packageId/revisions')
  @RequireMenu('/departure')
  listRevisions(
    @Req() request: { user: { organizationId: string; userId: string } },
    @Param('packageId') packageId: string,
  ): Promise<ReviewRevisionView[]> {
    return this.collaboration.listRevisions(
      request.user.organizationId,
      request.user.userId,
      packageId,
    )
  }
}
