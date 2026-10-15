import type { CookieOptions, Request, Response } from 'express';
import { env } from '../../config/env.js';
import { getContext, getRequestedOrganizationId } from '../../common/utils/request-context.js';
import { resetTokenSchema } from './auth.dto.js';
import type { AuthResult, AuthService } from './auth.service.js';

const REFRESH_COOKIE = 'tf_refresh';

// httpOnly: JS cannot read it. sameSite strict + path limit = CSRF protection.
const cookieOptions: CookieOptions = {
  httpOnly: true,
  secure: env.isProduction,
  sameSite: 'strict',
  path: '/api/auth',
};

export class AuthController {
  private readonly authService: AuthService;

  constructor(authService: AuthService) {
    this.authService = authService;
  }

  register = async (req: Request, res: Response) => {
    const result = await this.authService.register(req.body, getContext(req));
    this.sendSession(res, result, 201);
  };

  login = async (req: Request, res: Response) => {
    const result = await this.authService.login(req.body, getContext(req), getRequestedOrganizationId(req));
    this.sendSession(res, result);
  };

  refresh = async (req: Request, res: Response) => {
    try {
      const result = await this.authService.refresh(req.cookies?.[REFRESH_COOKIE], getContext(req), getRequestedOrganizationId(req));
      this.sendSession(res, result);
    } catch (err) {
      res.clearCookie(REFRESH_COOKIE, cookieOptions);
      throw err;
    }
  };

  logout = async (req: Request, res: Response) => {
    await this.authService.logout(req.cookies?.[REFRESH_COOKIE]);
    res.clearCookie(REFRESH_COOKIE, cookieOptions);
    res.status(204).send();
  };

  logoutAll = async (req: Request, res: Response) => {
    await this.authService.logoutAll(req.user!.id, getContext(req));
    res.clearCookie(REFRESH_COOKIE, cookieOptions);
    res.status(204).send();
  };

  /** Profile for the organization in X-Organization-Id (or the user's default one). */
  me = async (req: Request, res: Response) => {
    res.json({ success: true, data: await this.authService.me(getContext(req), getRequestedOrganizationId(req)) });
  };

  switchOrganization = async (req: Request, res: Response) => {
    res.json({ success: true, data: await this.authService.switchOrganization(req.body.organizationId, getContext(req)) });
  };

  updateProfile = async (req: Request, res: Response) => {
    const profile = await this.authService.updateProfile(req.body.name, getContext(req), getRequestedOrganizationId(req));
    res.json({ success: true, data: profile });
  };

  /** Same response whether or not the email exists (no account enumeration). */
  forgotPassword = async (req: Request, res: Response) => {
    await this.authService.forgotPassword(req.body.email, getContext(req));
    res.json({ success: true, data: { message: 'If an account exists for this email, a reset link has been sent.' } });
  };

  checkResetToken = async (req: Request, res: Response) => {
    res.json({ success: true, data: await this.authService.checkResetToken(resetTokenSchema.parse(req.params.token)) });
  };

  resetPassword = async (req: Request, res: Response) => {
    await this.authService.resetPassword(req.body.token, req.body.password, getContext(req));
    res.clearCookie(REFRESH_COOKIE, cookieOptions);
    res.status(204).send();
  };

  changePassword = async (req: Request, res: Response) => {
    await this.authService.changePassword(req.body.currentPassword, req.body.newPassword, req.cookies?.[REFRESH_COOKIE], getContext(req));
    res.status(204).send();
  };

  private sendSession(res: Response, result: AuthResult, status = 200) {
    res.cookie(REFRESH_COOKIE, result.refreshToken, {
      ...cookieOptions,
      maxAge: env.auth.refreshTokenDays * 24 * 60 * 60 * 1000,
    });
    res.status(status).json(
      {
        success: true,
        data: {
          accessToken: result.accessToken, user: result.user
        }
      }
    );
  }
}
