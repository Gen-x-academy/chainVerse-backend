import {
  BadRequestException,
  Injectable,
  InternalServerErrorException,
  NotFoundException,
  UnauthorizedException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import moment from 'moment';
import { Brackets, Repository } from 'typeorm';
import { OrganizationUserFunction } from './helper/organization-user-function';
import { OrganizationUser } from './entities/organization-user.entity';
import { JwtHelper } from './helper/jwt-helper';
import { CreateOrganizationUserDto } from './dto/create-organization-user.dto';
import { OrganizationUserMessage } from './helper/organization-user-messages';
import { OrganizationUserLoginDto } from './dto/organization-user-login.dto';
import { SendPasswordResetOtpDto } from './dto/send-password-reset-otp.dto';
import { ResendOtpDto } from './dto/resend-otp.dto';
import { VerifyOtpDto } from './dto/verify-otp.dto';
import { ResetPasswordDto } from './dto/reset-password.dto';
import { OrganizationStatus } from 'src/common/enum/organization-status';
import { PaginationQueryDto } from 'src/common/pagination/dto/pagination-query.dto';
import { AdminUserFunction } from 'src/admin-user/helper/admin-user-function';

@Injectable()
export class OrganizationUserService {
  constructor(
    @InjectRepository(OrganizationUser)
    private readonly organizationUserRepository: Repository<OrganizationUser>,
    private readonly organizationUserFunction: OrganizationUserFunction,
    private readonly jwtHelper: JwtHelper,
    private readonly adminUserFunction: AdminUserFunction,
  ) {}

  async createOrganizationUserAccount(
    dto: CreateOrganizationUserDto,
    organizationId: number,
  ) {
    const existingOrganizationUserEmail =
      await this.organizationUserRepository.findOne({
        where: { email: dto.email },
      });

    if (existingOrganizationUserEmail) {
      throw new BadRequestException(
        OrganizationUserMessage.EMAIL_ALREADY_IN_USE,
      );
    }

    const generatePassword =
      this.organizationUserFunction.generateRandomPassword();

    const hashedPassword =
      await this.organizationUserFunction.hashPassword(generatePassword);

    const organizationUser = this.organizationUserRepository.create({
      firstName: dto.firstName,
      lastName: dto.lastName,
      email: dto.email,
      password: hashedPassword,
      role: dto.role,
      status: dto.status,
      organizationId,
    });

    await this.organizationUserRepository.save(organizationUser);

    return {
      message: OrganizationUserMessage.USER_CREATED,
    };
  }

  async login(dto: OrganizationUserLoginDto) {
    const OrganizationUser = await this.organizationUserRepository.findOne({
      where: { email: dto.email },
    });
    if (
      !OrganizationUser ||
      !(await this.organizationUserFunction.verifyPassword(
        dto.password,
        OrganizationUser.password,
      ))
    ) {
      throw new UnauthorizedException(
        OrganizationUserMessage.INVALID_CREDENTIALS,
      );
    }

    const tokens = this.jwtHelper.generateTokens(OrganizationUser);
    return {
      message: OrganizationUserMessage.LOGIN_SUCCESS,
      user: this.organizationUserFunction.formatOrganizationUserResponse(
        OrganizationUser,
      ),
      tokens: tokens,
    };
  }

  async refreshToken(refreshToken: string) {
    const validatedRefreshToken =
      this.jwtHelper.validateRefreshToken(refreshToken);
    const OrganizationUserId = Number(validatedRefreshToken);
    const OrganizationUser = await this.organizationUserRepository.findOne({
      where: { id: OrganizationUserId },
    });
    if (!OrganizationUser) {
      throw new UnauthorizedException(
        OrganizationUserMessage.INVALID_REFRESH_TOKEN,
      );
    }
    const accessToken = this.jwtHelper.generateAccessToken(OrganizationUser);
    return {
      message: OrganizationUserMessage.REFRESH_TOKEN_SUCCESS,
      accessToken: accessToken,
    };
  }
  async retrieveOrganizationUserById(OrganizationUserId: number) {
    const OrganizationUser = await this.organizationUserRepository.findOne({
      where: { id: OrganizationUserId },
    });
    if (!OrganizationUser) {
      throw new UnauthorizedException(OrganizationUserMessage.USER_NOT_FOUND);
    }
    const result =
      this.organizationUserFunction.formatOrganizationUserResponse(
        OrganizationUser,
      );
    return result;
  }

  async requestResetPasswordOtp(
    sendPasswordResetOtpDto: SendPasswordResetOtpDto,
  ) {
    if (!sendPasswordResetOtpDto.email) {
      throw new BadRequestException(OrganizationUserMessage.EMAIL_REQUIRED);
    }

    const OrganizationUser = await this.organizationUserRepository.findOne({
      where: { email: sendPasswordResetOtpDto.email },
    });

    if (!OrganizationUser) {
      throw new NotFoundException(OrganizationUserMessage.USER_NOT_FOUND);
    }

    const otp = this.organizationUserFunction.generateVerificationCode();

    OrganizationUser.passwordResetCode = otp;
    OrganizationUser.passwordResetCodeExpiresAt = moment()
      .add(10, 'minutes')
      .toDate();
    await this.organizationUserRepository.save(OrganizationUser);
    // await this.emailService.sendPasswordResetEmail(
    //   organization.adminEmail,
    //   otp,
    //   organization.adminName,
    // );

    return { message: OrganizationUserMessage.OTP_SENT };
  }

  async resendResetPasswordVerificationOtp(resendOtpDto: ResendOtpDto) {
    try {
      if (!resendOtpDto.email) {
        throw new BadRequestException(OrganizationUserMessage.EMAIL_REQUIRED);
      }

      const OrganizationUser = await this.organizationUserRepository.findOne({
        where: { email: resendOtpDto.email },
      });
      if (!OrganizationUser) {
        throw new NotFoundException(OrganizationUserMessage.USER_NOT_FOUND);
      }

      const otp = this.organizationUserFunction.generateVerificationCode();

      OrganizationUser.passwordResetCode = otp;
      OrganizationUser.passwordResetCodeExpiresAt = moment()
        .add(10, 'minutes')
        .toDate();
      await this.organizationUserRepository.save(OrganizationUser);
      // await this.emailService.sendPasswordResetEmail(
      //   user.adminEmail,
      //   otp,
      //   user.adminName,
      // );

      return { message: OrganizationUserMessage.OTP_SENT };
    } catch (error) {
      throw new InternalServerErrorException(
        error || 'Error resending verification code',
      );
    }
  }

  async verifyResetPasswordOtp(verifyOtpDto: VerifyOtpDto) {
    if (!verifyOtpDto.email) {
      throw new BadRequestException(OrganizationUserMessage.EMAIL_REQUIRED);
    }

    if (!verifyOtpDto.otp) {
      throw new BadRequestException(OrganizationUserMessage.OTP_REQUIRED);
    }

    const OrganizationUser = await this.organizationUserRepository.findOne({
      where: { email: verifyOtpDto.email },
    });

    if (!OrganizationUser) {
      throw new NotFoundException(OrganizationUserMessage.USER_NOT_FOUND);
    }

    if (OrganizationUser.passwordResetCode !== verifyOtpDto.otp) {
      throw new UnauthorizedException(OrganizationUserMessage.INVALID_OTP);
    }

    if (
      !OrganizationUser.passwordResetCodeExpiresAt ||
      (OrganizationUser.passwordResetCodeExpiresAt instanceof Date &&
        OrganizationUser.passwordResetCodeExpiresAt < new Date())
    ) {
      throw new UnauthorizedException(OrganizationUserMessage.OTP_EXPIRED);
    }

    await this.organizationUserRepository.save(OrganizationUser);

    return { message: OrganizationUserMessage.OTP_VERIFIED };
  }

  async resetPassword(resetPasswordDto: ResetPasswordDto) {
    const { otp, newPassword, confirmNewPassword } = resetPasswordDto;

    const OrganizationUser = await this.organizationUserRepository.findOneBy({
      passwordResetCode: otp,
    });

    if (!OrganizationUser) {
      throw new NotFoundException(OrganizationUserMessage.USER_NOT_FOUND);
    }

    if (
      !OrganizationUser.passwordResetCodeExpiresAt ||
      OrganizationUser.passwordResetCodeExpiresAt < new Date()
    ) {
      throw new UnauthorizedException(OrganizationUserMessage.OTP_EXPIRED);
    }

    if (!this.organizationUserFunction.isValidPassword(newPassword)) {
      throw new BadRequestException(OrganizationUserMessage.IS_VALID_PASSWORD);
    }

    if (newPassword !== confirmNewPassword) {
      throw new BadRequestException(
        OrganizationUserMessage.PASSWORDS_DO_NOT_MATCH,
      );
    }
    OrganizationUser.password =
      await this.organizationUserFunction.hashPassword(newPassword);
    OrganizationUser.passwordResetCode = undefined;
    OrganizationUser.passwordResetCodeExpiresAt = undefined;

    await this.organizationUserRepository.save(OrganizationUser);
    return {
      message: OrganizationUserMessage.PASSWORD_RESET_SUCCESS,
    };
  }

  async retrieveUserById(userId: number) {
    const OrganizationUser = await this.organizationUserRepository.findOne({
      where: { id: userId },
    });
    if (!OrganizationUser) {
      throw new UnauthorizedException('User not found.');
    }
    const result =
      this.organizationUserFunction.formatOrganizationUserResponse(
        OrganizationUser,
      );
    return result;
  }

  async retrieveAllOrganizationUser(query: PaginationQueryDto) {
    const page = query.page ?? 1;
    const perPage = query.perPage ?? 10;
    const skip = (page - 1) * perPage;

    const qb = this.organizationUserRepository
      .createQueryBuilder('user')
      .select([
        'user.id',
        'user.firstName',
        'user.lastName',
        'user.role',
        'user.createdAt',
        'user.status',
      ]);

    if (query.status) {
      qb.andWhere('user.status = :status', {
        status: query.status,
      });
    }

    if (query.searchTerm) {
      const search = `%${query.searchTerm.toLowerCase()}%`;

      qb.andWhere(
        new Brackets((qb) => {
          qb.where('LOWER(user.firstName) LIKE :search', { search })
            .orWhere('LOWER(user.lastName) LIKE :search', { search })
            .orWhere('LOWER(user.role) LIKE :search', { search });
        }),
      );
    }

    const [
      totalOrganizationsUser,
      activeOrganizationsUser,
      pendingOrganizationsUser,
      suspendedOrganizationsUser,
    ] = await Promise.all([
      this.organizationUserRepository.count(),
      this.organizationUserRepository.count({
        where: { status: OrganizationStatus.ACTIVE },
      }),
      this.organizationUserRepository.count({
        where: { status: OrganizationStatus.PENDING },
      }),
      this.organizationUserRepository.count({
        where: { status: OrganizationStatus.SUSPENDED },
      }),
    ]);

    const [organizationUser, totalItems] = await qb
      .orderBy('user.createdAt', 'DESC')
      .skip(skip)
      .take(perPage)
      .getManyAndCount();

    const items = organizationUser.map((user) => ({
      id: user.id,
      firstName: user.firstName,
      lastName: user.lastName,
      role: user.role,
      status: user.status,
      createdAt: this.adminUserFunction.dateFormat(user.createdAt),
    }));

    return {
      message: 'Success',
      stats: {
        totalOrganizationsUser,
        activeOrganizationsUser,
        pendingOrganizationsUser,
        suspendedOrganizationsUser,
      },
      items,
      meta: {
        currentPage: page,
        itemsPerPage: perPage,
        totalItems,
        totalPages: Math.ceil(totalItems / perPage),
        hasPreviousPage: page > 1,
        hasNextPage: page < Math.ceil(totalItems / perPage),
      },
    };
  }
}
