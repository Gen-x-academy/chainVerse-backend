import { Entity, PrimaryGeneratedColumn, Column, OneToMany } from 'typeorm';
import { Course } from './course.entity';
import { Feedback } from './feedback.entity';
import { Discussion } from './discussion.entity';
import { LearningMaterial } from './learning-material.entity';
import { Certificate } from './certificate.entity';

@Entity()
export class Tutor {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column()
  name: string;

  @OneToMany(() => Course, course => course.tutor)
  courses: Course[];

  @OneToMany(() => Feedback, feedback => feedback.tutor)
  feedbacks: Feedback[];

  @OneToMany(() => Discussion, discussion => discussion.tutor)
  discussions: Discussion[];

  @OneToMany(() => LearningMaterial, material => material.tutor)
  materials: LearningMaterial[];

  @OneToMany(() => Certificate, cert => cert.tutor)
  certificates: Certificate[];
}