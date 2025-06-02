import { Entity, ManyToOne, PrimaryGeneratedColumn } from "typeorm";
import { Tutor } from "./tutor.entity";

@Entity()
export class LearningMaterial {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @ManyToOne(() => Tutor, tutor => tutor.materials)
  tutor: Tutor;
}