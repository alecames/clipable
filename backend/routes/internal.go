package routes

import (
	"context"
	"fmt"
	"io"
	"net/http"

	"github.com/gorilla/mux"
	"github.com/gotd/contrib/http_range"
	log "github.com/sirupsen/logrus"
)

func (r *Routes) UploadObject(w http.ResponseWriter, req *http.Request) {
	vars := mux.Vars(req)
	r.ObjectStore.PutObject(context.Background(), vars["path"]+"/"+vars["file"], req.Body, -1)
}

func (r *Routes) ReadObject(w http.ResponseWriter, req *http.Request) {
	// Get the object ID from the URL
	vars := mux.Vars(req)

	if !r.ObjectStore.HasObject(context.Background(), vars["path"]+"/"+vars["file"]) {
		http.Error(w, "Not Found", http.StatusNotFound)
		return
	}

	// Get the object from the minio server
	objReader, size, err := r.ObjectStore.GetObject(context.Background(), vars["path"]+"/"+vars["file"])

	if err != nil {
		http.Error(w, "Internal server error", http.StatusInternalServerError)
		log.WithError(err).Error("Failed to get object")
		return
	}

	defer objReader.Close()

	ranges, err := http_range.ParseRange(req.Header.Get("Range"), size)

	if err != nil {
		http.Error(w, "Bad Request", http.StatusBadRequest)
		return
	}

	if len(ranges) > 1 {
		http.Error(w, "Requested Range Not Satisfiable", http.StatusRequestedRangeNotSatisfiable)
		return
	}

	if len(ranges) == 1 {
		if ranges[0].Start > size || ranges[0].Start+ranges[0].Length > size {
			http.Error(w, "Requested Range Not Satisfiable", http.StatusRequestedRangeNotSatisfiable)
			return
		}

		// Accept ranges
		w.Header().Set("Accept-Ranges", "bytes")
		w.Header().Set("Content-Range", fmt.Sprintf("bytes %d-%d/%d", ranges[0].Start, ranges[0].Length, size))
		w.Header().Set("Content-Length", fmt.Sprint(ranges[0].Length))

		// Set the status code
		w.WriteHeader(http.StatusPartialContent)

		// Seek to the start of the range
		_, err = objReader.Seek(ranges[0].Start, io.SeekStart)

		if err != nil {
			http.Error(w, "Internal server error", http.StatusInternalServerError)
			log.WithError(err).Error("Failed to seek to start of range")
			return
		}

		io.CopyN(w, objReader, ranges[0].Length)
	} else {
		w.Header().Set("Content-Length", fmt.Sprint(size))
		// Copy the object to the response writer
		_, err := io.Copy(w, objReader)
		if err != nil {
			http.Error(w, "Internal server error", http.StatusInternalServerError)
			log.WithError(err).Error("Failed to copy object to response writer")
			return
		}
	}
}