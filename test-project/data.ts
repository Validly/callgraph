export interface User {
  id: number;
  name: string;
  email: string;
}

export class UserRepository {
  private users: User[] = [];

  saveUser(user: User): void {
    this.users.push(user);
  }

  findById(id: number): User | undefined {
    return this.users.find(u => u.id === id);
  }

  findByEmail(email: string): User | undefined {
    return this.users.find(u => u.email === email);
  }
}