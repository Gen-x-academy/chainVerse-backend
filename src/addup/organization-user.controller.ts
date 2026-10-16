import {
  Controller,
  Post,
  Body,
  HttpCode,
  HttpStatus,
  UseGuards,
  Param,
  Get,
  Query,
} from '@nestjs/common';
import {
  ApiBody,
  ApiOperation,
  ApiQuery,
  ApiResponse,
  ApiTags,
} from '@nestjs/swagger';
import { RefreshTokenDto } from './dto/refresh-token.dto';
import { SendPasswordResetOtpDto } from './dto/send-password-reset-otp.dto';
import { ResendOtpDto } from './dto/resend-otp.dto';
import { VerifyOtpDto } from './dto/verify-otp.dto';
import { ResetPasswordDto } from './dto/reset-password.dto';
import { OrganizationUserService } from './organization-user.service';
import { CreateOrganizationUserDto } from './dto/create-organization-user.dto';
import { OrganizationUserLoginDto } from './dto/organization-user-login.dto';
import { OrganizationUserMessage } from './helper/organization-user-messages';
import { OrganizationRole } from 'src/common/enum/organization-role';
import { Role } from 'src/organization/decorators/roles.decorators';
import { OrganizationJwtAuthGuard } from 'src/organization/guard/jwt.auth.guard';
import { RolesGuard } from 'src/organization/guard/roles.guard';
import { PaginationQueryDto } from 'src/common/pagination/dto/pagination-query.dto';

@ApiTags('Organization User')
@Controller('api/v1/organization-user')
export class OrganizationUserController {
  constructor(
    private readonly organizationUserService: OrganizationUserService,
  ) {}

  @Role(OrganizationRole.ORGANIZATION_ADMIN)
  @UseGuards(OrganizationJwtAuthGuard, RolesGuard)
  @Post(':id/create')
  @ApiOperation({ summary: 'Create admin user account' })
  @ApiResponse({
    status: 201,
    description: 'user created successfully',
    schema: {
      example: {
        message: 'user created successfully',
      },
    },
  })
  @ApiResponse({
    status: 400,
    description: 'Validation or duplicate error',
  })
  @ApiBody({
    description: 'Create admin user Payload',
    examples: {
      sample: {
        summary: 'Sample admin user Payload',
        value: {
          firstName: 'Fairfield',
          lastName: 'joe',
          status: 'PENDING',
          role: 'Mentor',
          email: 'admin@fairfieldschool.com',
        },
      },
    },
  })
  async createOrganizationUserAccount(
    @Body() dto: CreateOrganizationUserDto,
    @Param('id') userId: number,
  ) {
    return this.organizationUserService.createOrganizationUserAccount(
      dto,
      userId,
    );
  }

  // @UseGuards(LoginRateLimitGuard)
  @Post('login')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Login User' })
  @ApiBody({
    description: 'Login  User',
    type: OrganizationUserLoginDto,
    examples: {
      valid: {
        summary: 'Valid request',
        value: {
          email: 'user@example.com',
          password: '123456',
        },
      },
    },
  })
  @ApiResponse({
    status: 200,
    description: 'Login successful',
    schema: {
      example: {
        message: OrganizationUserMessage.LOGIN_SUCCESS,
        user: {
          id: 1,
          email: 'adminEmail,',
          firstName: 'john,',
          lastName: 'doe,',
          role: 'admin,',
          status: 'ACTIVE',
        },
        tokens: {
          accessToken: 'jwt-access-token',
          refreshToken: 'jwt-refresh-token',
        },
      },
    },
  })
  @ApiResponse({
    status: 400,
    description: 'Validation error',
    schema: {
      example: {
        message: 'Validation failed',
        errors: {
          email: 'Please provide a valid email',
          password: 'Password is required',
        },
      },
    },
  })
  @ApiResponse({
    status: 401,
    description: 'Unauthorized',
    schema: {
      example: {
        message: OrganizationUserMessage.INVALID_CREDENTIALS,
      },
    },
  })
  login(@Body() dto: OrganizationUserLoginDto) {
    return this.organizationUserService.login(dto);
  }

  @Post('refresh-token')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Refresh access token' })
  @ApiBody({
    description: 'Provide a valid refresh token to get a new access token',
    type: RefreshTokenDto,
    examples: {
      valid: {
        summary: 'Valid request',
        value: {
          refreshToken: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...',
        },
      },
    },
  })
  @ApiResponse({
    status: 200,
    description: 'Refresh token success',
    schema: {
      example: {
        message: OrganizationUserMessage.REFRESH_TOKEN_SUCCESS,
        accessToken: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...',
      },
    },
  })
  @ApiResponse({
    status: 401,
    description: 'Invalid or expired refresh token',
    schema: {
      example: {
        message: OrganizationUserMessage.INVALID_REFRESH_TOKEN,
        error: 'Unauthorized',
        statusCode: 401,
      },
    },
  })
  refreshToken(@Body() refreshTokenDto: RefreshTokenDto) {
    return this.organizationUserService.refreshToken(
      refreshTokenDto.refreshToken,
    );
  }

  @Post('/send-reset-password-otp')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Subscriber request a password reset OTP' })
  @ApiBody({
    description:
      'Provide your registered email address to receive an OTP for password reset',
    type: SendPasswordResetOtpDto,
    examples: {
      valid: {
        summary: 'Valid request',
        value: {
          email: 'john.doe@example.com',
        },
      },
    },
  })
  @ApiResponse({
    status: 200,
    description: OrganizationUserMessage.OTP_SENT,
    schema: {
      example: {
        message: 'OTP sent successfully',
      },
    },
  })
  @ApiResponse({
    status: 400,
    description: OrganizationUserMessage.EMAIL_REQUIRED,
    schema: {
      example: {
        statusCode: 400,
        message: 'email is required',
        error: 'Bad Request',
      },
    },
  })
  @ApiResponse({
    status: 404,
    description: OrganizationUserMessage.USER_NOT_FOUND,
    schema: {
      example: {
        statusCode: 404,
        message: 'user not found',
        error: 'Not Found',
      },
    },
  })
  requestResetPasswordOtp(
    @Body() sendPasswordResetOtpDto: SendPasswordResetOtpDto,
  ) {
    return this.organizationUserService.requestResetPasswordOtp(
      sendPasswordResetOtpDto,
    );
  }

  @Post('resend-reset-password-otp')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Resend reset password OTP' })
  @ApiBody({
    description: 'Provide the email to resend the reset password OTP',
    type: ResendOtpDto,
    examples: {
      valid: {
        summary: 'Valid request',
        value: {
          email: 'user@example.com',
        },
      },
    },
  })
  @ApiResponse({
    status: 200,
    description: 'OTP sent successfully',
    schema: {
      example: {
        message: OrganizationUserMessage.OTP_SENT,
      },
    },
  })
  @ApiResponse({
    status: 400,
    description: 'Validation error',
    schema: {
      example: {
        message: 'Validation failed',
        errors: {
          email: 'Please provide a valid email',
        },
      },
    },
  })
  @ApiResponse({
    status: 404,
    description: 'User not found',
    schema: {
      example: {
        message: OrganizationUserMessage.USER_NOT_FOUND,
      },
    },
  })
  resendResetPasswordVerificationOtp(@Body() resendOtpDto: ResendOtpDto) {
    return this.organizationUserService.resendResetPasswordVerificationOtp(
      resendOtpDto,
    );
  }

  @Post('verify-reset-password-otp')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Verify  reset password OTP' })
  @ApiBody({
    type: VerifyOtpDto,
    description: 'Provide email and OTP for verification',
    examples: {
      valid: {
        summary: 'Valid request',
        value: {
          email: 'user@example.com',
          otp: '123456',
        },
      },
    },
  })
  @ApiResponse({
    status: 200,
    description: 'OTP verified successfully',
    schema: {
      example: {
        message: OrganizationUserMessage.OTP_VERIFIED,
      },
    },
  })
  @ApiResponse({
    status: 400,
    description: 'Validation error',
    schema: {
      example: {
        message: 'Validation failed',
        errors: {
          email: 'Please provide a valid email',
          otp: 'otp is required',
        },
      },
    },
  })
  @ApiResponse({
    status: 401,
    description: 'Invalid or expired OTP',
    schema: {
      example: {
        message: OrganizationUserMessage.INVALID_OTP,
      },
    },
  })
  @ApiResponse({
    status: 404,
    description: 'user not found',
    schema: {
      example: {
        message: OrganizationUserMessage.USER_NOT_FOUND,
      },
    },
  })
  verifyResetPasswordOtp(@Body() verifyOtpDto: VerifyOtpDto) {
    return this.organizationUserService.verifyResetPasswordOtp(verifyOtpDto);
  }

  @Post('reset-password')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Reset password with OTP' })
  @ApiBody({
    description: 'Provide OTP and new password to reset password',
    type: ResetPasswordDto,
    examples: {
      valid: {
        summary: 'Valid request',
        value: {
          otp: '123456',
          newPassword: 'StrongPass123',
          confirmNewPassword: 'StrongPass123',
        },
      },
    },
  })
  @ApiResponse({
    status: 200,
    description: 'Password reset successful',
    schema: {
      example: {
        message: OrganizationUserMessage.PASSWORD_RESET_SUCCESS,
      },
    },
  })
  @ApiResponse({
    status: 400,
    description: 'Validation error',
    schema: {
      example: {
        message: 'Validation failed',
        errors: {
          newPassword: 'New password must be at least 8 characters long',
          confirmNewPassword: 'Passwords do not match',
        },
      },
    },
  })
  @ApiResponse({
    status: 401,
    description: 'OTP expired',
    schema: {
      example: {
        message: OrganizationUserMessage.INVALID_OTP,
      },
    },
  })
  @ApiResponse({
    status: 404,
    description: 'User not found',
    schema: {
      example: {
        message: OrganizationUserMessage.USER_NOT_FOUND,
      },
    },
  })
  async resetPassword(@Body() resetPasswordDto: ResetPasswordDto) {
    return this.organizationUserService.resetPassword(resetPasswordDto);
  }

  @Get('retrieve-all')
  @Role(OrganizationRole.ORGANIZATION_ADMIN)
  @UseGuards(OrganizationJwtAuthGuard, RolesGuard)
  @ApiOperation({
    summary: 'Retrieve all organizations user',
    description:
      'Returns paginated organizations, dashboard statistics, filtering, searching and pagination metadata',
  })
  @ApiQuery({
    name: 'page',
    required: false,
    example: 1,
  })
  @ApiQuery({
    name: 'perPage',
    required: false,
    example: 10,
  })
  @ApiQuery({
    name: 'category',
    required: false,
    description: 'Filter by organization status',
    example: 'ACTIVE',
  })
  @ApiQuery({
    name: 'searchTerm',
    required: false,
    description: 'Search by name, type, country or state',
    example: 'lagos',
  })
  @ApiResponse({
    status: 200,
    description: 'Success',
    schema: {
      example: {
        message: 'Success',
        stats: {
          totalOrganizationUser: 120,
          activeOrganizationUser: 85,
          pendingOrganizationUser: 25,
          suspendedOrganizationUser: 10,
        },
        items: [
          {
            id: 1,
            firstName: 'Fairfield International School',
            lastName: 'Educational Institution',
            role: 'Nigeria, Lagos',
            status: 'ACTIVE',
            createdAt: '5th oct 2005',
          },
          {
            id: 2,
            organizationName: 'Greenfield Academy',
            organizationType: 'Educational Institution',
            location: 'Nigeria, Abuja',
            status: 'PENDING',
          },
        ],
        meta: {
          currentPage: 1,
          itemsPerPage: 10,
          totalItems: 120,
          totalPages: 12,
          hasPreviousPage: false,
          hasNextPage: true,
        },
      },
    },
  })
  async retrieveAllOrganizations(@Query() query: PaginationQueryDto) {
    return this.organizationUserService.retrieveAllOrganizationUser(query);
  }
}
