const prisma = require('../config/prisma');

const listComics = async (req, res) => {
  const comics = await prisma.comic.findMany({
    where: { userId: req.user.id },
    include: { panels: { orderBy: { order: 'asc' }, take: 1 } },
    orderBy: { updatedAt: 'desc' },
  });
  res.json(comics);
};

const getComic = async (req, res) => {
  const comic = await prisma.comic.findFirst({
    where: { id: req.params.id, userId: req.user.id },
    include: { panels: { orderBy: { order: 'asc' } } },
  });
  if (!comic) return res.status(404).json({ error: 'Comic not found' });
  res.json(comic);
};

const createComic = async (req, res) => {
  const { title = 'Untitled Comic' } = req.body;
  const firstPageId = require('crypto').randomUUID();
  const comic = await prisma.comic.create({
    data: {
      title,
      userId: req.user.id,
      pages: [{ id: firstPageId, layout: 'single' }],
      panels: {
        create: [{ order: 0, data: {} }],
      },
    },
    include: { panels: { orderBy: { order: 'asc' } } },
  });
  res.status(201).json(comic);
};

const updateComic = async (req, res) => {
  const { title, panels, pages } = req.body;

  const existing = await prisma.comic.findFirst({
    where: { id: req.params.id, userId: req.user.id },
  });
  if (!existing) return res.status(404).json({ error: 'Comic not found' });

  const comic = await prisma.$transaction(async (tx) => {
    await tx.comic.update({
      where: { id: req.params.id },
      data: {
        title,
        ...(pages !== undefined && { pages }),
      },
    });

    if (panels && Array.isArray(panels)) {
      await tx.panel.deleteMany({ where: { comicId: req.params.id } });
      await tx.panel.createMany({
        data: panels.map((p, i) => ({
          comicId: req.params.id,
          order: i,
          data: p.data || {},
        })),
      });
    }

    return tx.comic.findUnique({
      where: { id: req.params.id },
      include: { panels: { orderBy: { order: 'asc' } } },
    });
  });

  res.json(comic);
};

const deleteComic = async (req, res) => {
  const existing = await prisma.comic.findFirst({
    where: { id: req.params.id, userId: req.user.id },
  });
  if (!existing) return res.status(404).json({ error: 'Comic not found' });

  await prisma.comic.delete({ where: { id: req.params.id } });
  res.json({ message: 'Comic deleted' });
};

module.exports = { listComics, getComic, createComic, updateComic, deleteComic };
