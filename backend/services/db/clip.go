package db

import (
	"context"
	"database/sql"
	"io"
	"webserver/models"
	"webserver/services"

	"github.com/volatiletech/sqlboiler/v4/boil"
	"github.com/volatiletech/sqlboiler/v4/queries/qm"
)

type clips struct {
	db *sql.DB
	os services.ObjectStore
}

// NewClips Comment for linter
func NewClips(db *sql.DB, os services.ObjectStore) services.Clips {
	return &clips{db, os}
}

func (c *clips) Find(ctx context.Context, cid string) (*models.Clip, error) {
	return models.FindClip(ctx, c.db, cid)
}

func (c *clips) FindMany(ctx context.Context, mods ...qm.QueryMod) (models.ClipSlice, error) {
	return models.Clips(mods...).All(ctx, c.db)
}

func (c *clips) Exists(ctx context.Context, cid string) (bool, error) {
	return models.ClipExists(ctx, c.db, cid)
}

func (c *clips) SearchMany(ctx context.Context, query string) (models.ClipSlice, error) {
	return models.Clips(
		qm.Where("title LIKE ?", "%"+query+"%"),
		qm.Or("description LIKE ?", "%"+query+"%"),
	).All(ctx, c.db)
}

func (c *clips) Update(ctx context.Context, clip *models.Clip, columns boil.Columns) error {
	_, err := clip.Update(ctx, c.db, columns)
	return err
}

func (c *clips) Create(ctx context.Context, clip *models.Clip, columns boil.Columns) (services.ClipTx, error) {
	tx, err := c.db.BeginTx(ctx, nil)

	if err != nil {
		return nil, err
	}

	if err := clip.Insert(ctx, tx, columns); err != nil {
		return nil, err
	}

	return &clipTx{tx, clip, c.os, false}, nil
}

type clipTx struct {
	tx   *sql.Tx
	clip *models.Clip
	os   services.ObjectStore

	done bool
}

func (c *clipTx) UploadVideo(ctx context.Context, r io.Reader) (int64, error) {
	return c.os.PutObject(c.clip.ID+"/video", r, -1)
}

func (c *clipTx) Commit() error {
	err := c.tx.Commit()

	c.done = err == nil

	return err
}

func (c *clipTx) Rollback() error {
	if !c.done {
		if err := c.os.DeleteObject(c.clip.ID + "/video"); err != nil {
			return err
		}
	}
	return c.tx.Rollback()
}
