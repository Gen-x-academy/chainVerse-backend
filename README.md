

---

# 🚀 ChainVerse Backend (NestJS)

> A scalable, modular, and production-grade backend system for ChainVerse Academy, built with **NestJS** and designed using clean architecture principles, domain separation, and enterprise-ready patterns.

---

## 📌 Overview

This project represents a **full architectural migration** from **Express.js to NestJS**, aimed at transforming a flexible but loosely structured codebase into a **highly maintainable, testable, and scalable system**.

The backend is designed to support a modern learning platform with features such as:

* User authentication & role management
* Course creation and enrollment
* Certification and achievements
* Gamification systems
* Financial aid workflows
* Analytics and reporting
* Notifications and communication systems

### 🎯 Why This Migration Matters

Moving to NestJS enables:

* **Clear modular boundaries** → easier to scale teams and features
* **Dependency Injection (DI)** → better testability and loose coupling
* **Consistent architecture** → predictable code organization
* **Built-in best practices** → guards, interceptors, pipes, etc.
* **Future microservice readiness**

---

## 🏗 Tech Stack

| Layer          | Technology                          | Purpose                       |
| -------------- | ----------------------------------- | ----------------------------- |
| Framework      | NestJS                              | Backend architecture          |
| Language       | TypeScript                          | Type safety & maintainability |
| Authentication | JWT (Access + Refresh Tokens)       | Secure user sessions          |
| Validation     | class-validator / class-transformer | DTO validation                |
| ORM            | Prisma / TypeORM                    | Database abstraction          |
| Database       | PostgreSQL                          | Relational data storage       |
| Caching        | Redis (optional)                    | Performance optimization      |
| Documentation  | Swagger                             | API exploration               |
| Storage        | Local / S3-compatible               | File uploads                  |

---

## 📁 Project Architecture

The system follows a **feature-based modular architecture**, where each domain is isolated and self-contained.

```
src/
│
├── auth/                 # Authentication & JWT logic
├── users/                # Core user management
├── tutor-settings/       # Tutor-specific configurations
├── student-settings/     # Student preferences
├── admin-settings/       # Admin/moderator controls
├── courses/              # Course creation & management
├── reviews/              # Ratings & feedback
├── leaderboard/          # Ranking system
├── gamification/         # Points, badges, rewards
├── certification/        # Certificates & verification
├── financial-aid/        # Aid application system
├── reports/              # Analytics & reporting
├── notification/         # Email / in-app notifications
├── organization/         # Institutional management
├── subscription-plan/    # Plans & billing logic
├── session/              # Session tracking
└── common/               # Shared utilities & helpers
```

### 📦 Module Structure

Each module follows a consistent internal structure:

```
module/
├── module.module.ts      # Module definition
├── module.controller.ts  # Route handlers (thin layer)
├── module.service.ts     # Business logic
├── dto/                  # Data Transfer Objects (validation)
├── entities/             # Database models / schemas
└── guards/               # Route protection logic
```

### 🧠 Architectural Principles

* **Separation of concerns** (Controller vs Service vs Data)
* **Single Responsibility Principle**
* **Domain-driven structure**
* **Reusable shared utilities in `common/`**

---

## 🔐 Authentication & Authorization

The system uses **JWT-based authentication** with support for **access and refresh tokens**.

### 🔑 Authentication Flow

1. User logs in → receives:

   * Access Token (short-lived)
   * Refresh Token (long-lived)
2. Access token is used for API requests
3. Refresh token is used to issue new access tokens

### 🛡 Role-Based Access Control (RBAC)

Supported roles:

* `ADMIN`
* `MODERATOR`
* `TUTOR`
* `STUDENT`

### 🔒 Guards

* `JwtAuthGuard` → validates authenticated users
* `RolesGuard` → enforces role-based permissions

---

## 📦 Core Features Breakdown

### 👤 Account & Identity

* Multi-role authentication (Admin, Tutor, Student)
* Profile management per role
* Secure session handling

---

### 📚 Course System

* Course creation & categorization
* Advanced filtering & search
* Reviews, ratings, and feedback
* Course analytics & reporting

---

### 🏆 Gamification Engine

* Points accumulation system
* Leaderboards (ranking users)
* Achievement badges
* NFT-based rewards (extensible)

---

### 🎓 Certification System

* Certificate generation
* Download & verification
* Social sharing capabilities
* Controlled name-change request flow

---

### 💰 Financial Aid

* Student application workflow
* Admin review system
* Approval/rejection lifecycle

---

### 📊 Reporting & Analytics

* Tutor performance insights
* Student progress tracking
* Course-level analytics

---

### 🛎 Platform Systems

* Notifications (email/in-app ready)
* FAQ & legal pages
* Contact & messaging system
* Organization management
* Subscription plans
* Abuse reporting & moderation

---

## 🛠 Installation & Setup

```bash
# Clone repository
git clone https://github.com/your-username/chainverse-backend.git

# Enter project directory
cd chainverse-backend

# Install dependencies
npm install
```

---

## ⚙️ Environment Configuration

Create a `.env` file in the root directory:

```
PORT=3000

DATABASE_URL=postgresql://user:password@localhost:5432/chainverse

JWT_SECRET=your_access_secret
JWT_REFRESH_SECRET=your_refresh_secret
```

> 💡 Tip: Use strong secrets and never commit `.env` to version control.

---

## ▶️ Running the Application

```bash
# Development (watch mode)
npm run start:dev

# Build for production
npm run build

# Run production server
npm run start:prod
```

---

## 📄 API Documentation (Swagger)

After starting the server:

```
http://localhost:3000/api
```

This provides:

* Interactive API testing
* Request/response schemas
* Authentication support

---

## 🧪 Testing Strategy

```bash
# Unit tests
npm run test

# End-to-end tests
npm run test:e2e
```

### ✅ Testing Philosophy

* Services should be **unit tested**
* Critical flows should have **e2e coverage**
* Mock external dependencies where needed

---

## 🧩 Migration Philosophy

This migration was not just a rewrite—it was a **system redesign** focused on:

* Long-term maintainability
* Predictable development patterns
* Improved onboarding for new developers
* Scalability toward microservices

---

## 📌 Development Guidelines

To maintain consistency across the codebase:

* ✅ Keep controllers thin (no business logic)
* ✅ Place logic inside services
* ✅ Use DTOs for all inputs
* ✅ Validate all external data
* ✅ Protect routes with guards
* ✅ Document endpoints with Swagger decorators
* ✅ Follow SOLID principles

---

## 🚀 Future Roadmap

Planned enhancements include:

* Microservices architecture (gRPC / Redis / RMQ)
* Real-time features (WebSockets)
* Blockchain/NFT integrations
* Payment gateway integration
* CI/CD pipelines
* Docker & container orchestration

---

## 🤝 Contributing

We welcome contributions! Follow these steps:

1. Fork the repository
2. Create a feature branch (`feat/your-feature`)
3. Follow coding and architectural standards
4. Add validation and documentation
5. Submit a Pull Request

### 📌 Contribution Requirements

* Must follow NestJS best practices
* Must include DTO validation
* Must include Swagger docs
* Must pass all tests

---

## 📜 License

MIT License

---

