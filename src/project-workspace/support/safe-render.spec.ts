import { DomainException } from '../../common/errors/domain.exception';
import { ErrorCode } from '../../common/errors/error-codes.enum';
import { renderSafeMarkdown } from './safe-render';

describe('renderSafeMarkdown', () => {
  it('renders a limited markdown subset to escaped HTML', () => {
    const html = renderSafeMarkdown('**Bold** and `code` with <b>raw</b>');
    expect(html).toContain('<strong>Bold</strong>');
    expect(html).toContain('<code>code</code>');
    expect(html).toContain('&lt;b&gt;raw&lt;/b&gt;');
    expect(html).not.toContain('<b>');
  });

  it('allows only http(s) links and adds a safe rel attribute', () => {
    const html = renderSafeMarkdown('[docs](https://example.com/a?b=1)');
    expect(html).toContain('href="https://example.com/a?b=1"');
    expect(html).toContain('rel="noopener noreferrer"');
  });

  it('rejects active content with a stable validation code', () => {
    for (const source of [
      '<script>alert(1)</script>',
      '[x](javascript:alert(1))',
      '<img src=x onerror=alert(1)>',
      'data:text/html;base64,AAAA',
    ]) {
      try {
        renderSafeMarkdown(source);
        throw new Error('expected rejection');
      } catch (error) {
        expect((error as DomainException).errorCode).toBe(
          ErrorCode.VAL_WORKSPACE_UNSAFE_MARKUP,
        );
      }
    }
  });

  it('rejects empty and oversized content', () => {
    expect(() => renderSafeMarkdown('   ')).toThrow();
    expect(() => renderSafeMarkdown('x'.repeat(20_001))).toThrow();
  });
});
