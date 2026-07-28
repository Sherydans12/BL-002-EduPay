import {
  EMAIL_TEMPLATE_TYPES,
  renderEmailTemplatePreview,
  renderReminderTemplate,
} from './email-templates';

describe('email templates', () => {
  it.each(EMAIL_TEMPLATE_TYPES)(
    'genera una vista previa completa para %s',
    (type) => {
      const html = renderEmailTemplatePreview(type);

      expect(html).toContain('<!doctype html>');
      expect(html).toContain('Antonia González');
    },
  );

  it('escapa los valores interpolados en las plantillas', () => {
    const html = renderReminderTemplate({
      recipientName: '<María>',
      studentName: 'Ana',
      conceptName: '<script>',
      formattedAmount: '$45.000',
    });

    expect(html).toContain('&lt;María&gt;');
    expect(html).toContain('&lt;script&gt;');
  });
});
