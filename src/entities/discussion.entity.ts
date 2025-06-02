import { Entity, ManyToOne, PrimaryGeneratedColumn } from "typeorm";
import { Tutor } from "./tutor.entity";

@Entity()
export class Discussion {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @ManyToOne(() => Tutor, tutor => tutor.discussions)
  tutor: Tutor;
}