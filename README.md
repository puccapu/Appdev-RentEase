<div align="center">

# RentEase

### Apartment Rental Management System

*Simplifying property management, one lease at a time.*

[![Made with Node.js](https://img.shields.io/badge/Backend-Node.js-339933?style=flat-square&logo=node.js&logoColor=white)](#tech-stack)
[![Express](https://img.shields.io/badge/Framework-Express-000000?style=flat-square&logo=express&logoColor=white)](#tech-stack)
[![Database MySQL](https://img.shields.io/badge/Database-MySQL-4479A1?style=flat-square&logo=mysql&logoColor=white)](#tech-stack)
[![Frontend HTML CSS JS](https://img.shields.io/badge/Frontend-HTML%20%7C%20CSS%20%7C%20JS-E34F26?style=flat-square&logo=html5&logoColor=white)](#tech-stack)
[![Server DCISM](https://img.shields.io/badge/Server-DCISM-blue?style=flat-square)](#)

<br>

Built by **USC's finest, most overworked, software developers**

Developed by **IM2 Developers — Group VI**

</div>

<br>

---

## Table of Contents

- [Overview](#overview)
- [Features](#features)
- [Tech Stack](#tech-stack)
- [Setup & Installation](#setup--installation)
- [Contributing Workflow](#-for-contributors)
- [Team](#team)

<br>

---

## Overview

**RentEase** is a web-based platform designed to simplify and digitize the management of residential apartment properties. It enables property managers to:

- Organize apartment units by type (Studio, 1-Bedroom, Penthouse, etc.)
- Set and manage rental rates per unit type
- Store and maintain tenant information
- Manage lease contracts, including rental terms, monthly rent, and lease duration
- Track payment histories to monitor paid and unpaid rental periods

With a centralized database and a user-friendly interface, RentEase supports efficient, day-to-day property management operations from a single platform.

<br>

---

## Features

| Module | Description |
|---|---|
| **Unit Management** | Categorize units by type and configure individual rental rates |
| **Tenant Records** | Maintain detailed tenant profiles and contact information |
| **Lease Contracts** | Create and track contracts with custom terms and durations |
| **Payment Tracking** | Log payments and flag outstanding or upcoming dues |
| **Centralized Dashboard** | View property and tenant data in one consistent interface |

<br>

---

## Tech Stack

| Layer | Technology |
|---|---|
| **Runtime** | Node.js |
| **Framework** | Express |
| **Database** | MySQL (hosted on DCISM) |
| **Auth** | express-session + bcrypt |
| **Frontend** | HTML, CSS, JavaScript |

<br>

---

## Setup & Installation

**1. Open tunnel**
```bash
ssh -p22077 -L 3306:localhost:3306 s23400055@web.dcism.org
```

**2. Enter password**
```
salang-12345
```

**3. Seed database**
```bash
node seeder.js
```

**4. Start server**
```bash
npm run dev
```

**5. Open browser**
```
http://localhost:20229
```

**Default login:**
- Username: `admin`
- PIN: `2121`

<br>

---

## For Contributors

> This project is maintained exclusively by **IM2 Developers — Group VI**. Contributions are limited to authorized team members only.

Each contributor works on a **dedicated branch**. To keep `main` stable, please **do not push directly to it**.

### Workflow

1. **Clone the repository**
   In VS Code, open the Command Palette (`Ctrl+Shift+P` / `Cmd+Shift+P`), select **Git: Clone**, then paste the repository URL and choose a local folder to save it in.

2. **Check available branches** *(optional — just in case)*
```bash
git branch -a
```

3. **Switch to your assigned branch**
```bash
git checkout <your-branch>
```

4. **Make your changes, then stage and commit them**

   **Option A — Terminal**
```bash
git add .
git commit -m "Describe your change"
```

   **Option B — VS Code Source Control (GUI)**
   1. Click the **Source Control** icon in the left sidebar (or `Ctrl+Shift+G`).
   2. Hover over each changed file and click the **+** icon to stage it.
   3. Type your commit message in the message box at the top.
   4. Click the **Commit** button (or press `Ctrl+Enter`).

5. **Push your branch**

   **Option A — Terminal**
```bash
git push origin <your-branch>
```

   **Option B — VS Code Source Control (GUI)**
   Click **Sync Changes** (or **...** → **Push**) in the Source Control panel.

6. **Open a Pull Request** to `main` for review

<br>

---

## Team

- **Lance Vincent** [ Project Manager ]
- **Kintanar Matteo** [ Senior Developer ]
- **Christian J. Salang** [ Junior Developer / Database Manager ]
- **Iesha Katriel** [ Documentation Specialist ]
- **Martinez Minh** [ Documentation Specialist ]

<div align="center">

<br>

**IM2 Developers · Group VI**

Made with dedication and a healthy amount of caffeine

</div>