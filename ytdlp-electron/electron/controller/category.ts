/**
 * Category Controller - 分类 CRUD
 */

import { categoryService } from '~/electron/service/category';
import type { CategoryInput } from '~/electron/types';

export class CategoryController {
  getAll() {
    return categoryService.getAll();
  }

  create(data: CategoryInput) {
    return categoryService.create(data);
  }

  delete(data: { id: number }) {
    return categoryService.delete(data.id);
  }
}

(CategoryController as any).toString = () => '[class CategoryController]';
