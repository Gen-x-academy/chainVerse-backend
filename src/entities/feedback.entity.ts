import { Column, Entity, ManyToOne, PrimaryGeneratedColumn } from "typeorm";
import { Tutor } from "./tutor.entity";


@Entity()
export class Feedback {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column('float')
  rating: number;

  @ManyToOne(() => Tutor, tutor => tutor.feedbacks)
  tutor: Tutor;
}