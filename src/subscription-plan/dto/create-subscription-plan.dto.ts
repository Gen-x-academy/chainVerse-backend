export class CreateSubscriptionPlanDto {
  name!: string;
  description!: string;
  price!: number;
  duration!: number;
  features!: string[];
}
