import { Injectable } from '@nestjs/common'
import { PrismaService } from '../../database/prisma/prisma.service'

@Injectable()
export class HealthService {
  constructor(private readonly prisma: PrismaService) {}

  async getStatus() {
    await this.prisma.$queryRaw`SELECT 1`

    return {
      status: 'ok',
      timestamp: new Date().toISOString(),
    }
  }
}
