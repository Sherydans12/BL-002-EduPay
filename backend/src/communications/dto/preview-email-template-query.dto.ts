import { IsIn } from 'class-validator';
import {
  EMAIL_TEMPLATE_TYPES,
  type EmailTemplateType,
} from '../../mail/templates/email-templates';

export class PreviewEmailTemplateQueryDto {
  @IsIn([...EMAIL_TEMPLATE_TYPES])
  type!: EmailTemplateType;
}
