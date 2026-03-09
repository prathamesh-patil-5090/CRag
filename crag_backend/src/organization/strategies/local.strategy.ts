import { Injectable, UnauthorizedException } from '@nestjs/common';
import { PassportStrategy } from '@nestjs/passport';
import bcrypt from 'bcryptjs';
import { Strategy } from 'passport-local';
import { OrganizationService } from '../organization.service';

@Injectable()
export class LocalOrgStrategy extends PassportStrategy(Strategy, 'local-org') {
  constructor(private orgService: OrganizationService) {
    super({ usernameField: 'email' });
  }

  async validate(email: string, password: string) {
    const org = await this.orgService.findByOrgIdentifier(email);
    if (!org || !org.password)
      throw new UnauthorizedException('Invalid credentials');
    const isMatch = await bcrypt.compare(password, org.password);
    if (!isMatch) return null;

    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    const { password: _pw, ...result } = org;

    return result;
  }
}
