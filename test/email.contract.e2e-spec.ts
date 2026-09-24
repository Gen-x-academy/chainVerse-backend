import { Test as NestTest, TestingModule } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
import { AppModule } from '../src/app.module';
import { EmailService } from '../src/email/email.service';
import { SMTPServer } from 'smtp-server';

describe('Email Contract (e2e)', () => {
  let app: INestApplication;
  let emailService: EmailService;
  let smtpServer: SMTPServer;

  beforeAll(async () => {
    const moduleFixture: TestingModule = await NestTest.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleFixture.createNestApplication();
    await app.init();
    emailService = app.get(EmailService);

    smtpServer = new SMTPServer({
      authOptional: true,
      onData(stream, session, callback) {
        stream.pipe(process.stdout); // Print email content to console
        stream.on('end', callback);
      },
    });

    await new Promise<void>((resolve) => smtpServer.listen(2525, resolve));
  });

  afterAll(async () => {
    await new Promise<void>((resolve) => smtpServer.close(resolve));
    await app.close();
  });

  it('should send an email', async () => {
    const to = 'test@example.com';
    const subject = 'Test Email';
    const text = 'This is a test email.';

    // The test will pass if the email is sent without errors.
    // The email content will be printed to the console.
    await emailService.send(to, subject, text);
  });
});
