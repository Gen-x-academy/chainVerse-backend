import { Column, Entity, ManyToOne, OneToMany, PrimaryGeneratedColumn } from 'typeorm';
import { Tutor } from './tutor.entity';
import { Student } from './student.entity';

@Entity()
export class Course {
 @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column()
  title: string;

  @ManyToOne(() => Tutor, tutor => tutor.courses)
  tutor: Tutor;

  @OneToMany(() => Student, student => student.course)
  students: Student[];

  @Column({ default: 'in-progress' })
  status: 'in-progress' | 'completed';
}