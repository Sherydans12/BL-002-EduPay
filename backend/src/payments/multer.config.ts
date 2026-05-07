import { BadRequestException } from '@nestjs/common';
import { diskStorage } from 'multer';
import { extname } from 'path';
import { v4 as uuid } from 'uuid';

export const multerConfig = {
  storage: diskStorage({
    destination: './uploads',
    filename: (_req, file, cb) => {
      const uniqueName = `${uuid()}${extname(file.originalname)}`;
      cb(null, uniqueName);
    },
  }),
  fileFilter: (
    _req: any,
    file: Express.Multer.File,
    cb: (error: Error | null, acceptFile: boolean) => void,
  ) => {
    if (file.mimetype === 'application/pdf') {
      cb(null, true);
    } else {
      cb(
        new BadRequestException(
          `Tipo de archivo no permitido: "${file.mimetype}". Solo se aceptan archivos PDF (application/pdf).`,
        ),
        false,
      );
    }
  },
  limits: {
    fileSize: 10 * 1024 * 1024, // 10 MB
  },
};
