import { Body, Controller, Get, HttpCode, Post, Res, UseGuards } from '@nestjs/common';
import type { AuthenticatedUser } from '@jsams/shared-types';
import type { Response } from 'express';
import { EnterpriseAuthGuard } from '../../common/auth/enterprise-auth.guard';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { AuthSessionService } from './application/auth-session.service';
import { LdapAuthenticationService } from './application/ldap-authentication.service';
import { LoginDto } from './application/login.dto';
import { UserContextService } from './application/user-context.service';

@Controller('auth')
export class SecurityController {
  constructor(
    private readonly ldap: LdapAuthenticationService,
    private readonly sessions: AuthSessionService,
    private readonly users: UserContextService,
  ) {}

  @Post('login')
  @HttpCode(200)
  async login(
    @Body() input: LoginDto,
    @Res({ passthrough: true }) response: Response,
  ): Promise<AuthenticatedUser> {
    const principal = await this.ldap.authenticate(input.username, input.password);
    const session = await this.sessions.issue(principal);
    const user = await this.users.resolve({ ...principal, sessionExpiresAt: session.expiresAt });
    response.setHeader('Set-Cookie', session.cookie);
    return user;
  }

  @Post('logout')
  @HttpCode(204)
  logout(@Res({ passthrough: true }) response: Response): void {
    response.setHeader('Set-Cookie', this.sessions.clearCookie());
  }

  @Get('me')
  @UseGuards(EnterpriseAuthGuard)
  me(@CurrentUser() user: AuthenticatedUser): AuthenticatedUser {
    return user;
  }
}
