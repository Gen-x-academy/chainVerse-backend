import { Entity, ManyToOne, PrimaryGeneratedColumn } from "typeorm";
import { Tutor } from "./tutor.entity";

@Entity()
export class Certificate {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @ManyToOne(() => Tutor, tutor => tutor.certificates)
  tutor: Tutor;
}