import * as cdk from 'aws-cdk-lib';
import { Match, Template } from 'aws-cdk-lib/assertions';
import { POC_CONFIG, PROD_CONFIG } from '../lib/environment-config';
import { SecretsStack } from '../lib/stacks/secrets-stack';

function templateFor(config: typeof POC_CONFIG): Template {
  const app = new cdk.App();
  const stack = new SecretsStack(app, 'SecretsStack', { config });
  return Template.fromStack(stack);
}

describe('SecretsStack', () => {
  it('creates the four application secrets', () => {
    const template = templateFor(POC_CONFIG);
    template.resourceCountIs('AWS::SecretsManager::Secret', 4);
  });

  describe('rotation disabled (poc)', () => {
    let template: Template;
    beforeAll(() => {
      template = templateFor(POC_CONFIG);
    });

    it('creates no rotation schedules', () => {
      template.resourceCountIs('AWS::SecretsManager::RotationSchedule', 0);
    });

    it('creates no rotation Lambda', () => {
      template.resourceCountIs('AWS::Lambda::Function', 0);
    });
  });

  describe('rotation enabled (prod)', () => {
    let template: Template;
    beforeAll(() => {
      template = templateFor(PROD_CONFIG);
    });

    it('rotates the three generated secrets, not the Anthropic key', () => {
      template.resourceCountIs('AWS::SecretsManager::RotationSchedule', 3);
    });

    it('rotates every 30 days', () => {
      template.hasResourceProperties('AWS::SecretsManager::RotationSchedule', {
        RotationRules: { ScheduleExpression: 'rate(30 days)' },
      });
    });

    it('creates a single shared rotation Lambda', () => {
      template.resourceCountIs('AWS::Lambda::Function', 1);
      template.hasResourceProperties('AWS::Lambda::Function', {
        Handler: 'index.handler',
        Runtime: 'python3.11',
      });
    });

    it('grants the rotation Lambda the protocol write actions', () => {
      template.hasResourceProperties('AWS::IAM::Policy', {
        PolicyDocument: {
          Statement: Match.arrayWith([
            Match.objectLike({
              Action: [
                'secretsmanager:PutSecretValue',
                'secretsmanager:UpdateSecretVersionStage',
              ],
            }),
          ]),
        },
      });
    });
  });
});
