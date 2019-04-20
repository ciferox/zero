/* eslint-disable adone/no-undefined-comp */
import { default as Stats, FileType } from "../node_fs_stats";
import * as path from "path";

/**
 * Inode for a file. Stores an arbitrary (filesystem-specific) data payload.
 */
export class FileInode {
    constructor(data) {
        this.data = data;
    }

    isFile() {
        return true;
    }

    isDir() {
        return false;
    }

    getData() {
        return this.data;
    }

    setData(data) {
        this.data = data;
    }
}

/**
 * Inode for a directory. Currently only contains the directory listing.
 */
export class DirInode {
    /**
     * Constructs an inode for a directory.
     */
    constructor(data = null) {
        this.data = data;
        this._ls = {};
    }

    isFile() {
        return false;
    }

    isDir() {
        return true;
    }

    getData() {
        return this.data;
    }

    /**
     * Return a Stats object for this inode.
     * @todo Should probably remove this at some point. This isn't the
     *       responsibility of the FileIndex.
     */
    getStats() {
        return new Stats(FileType.DIRECTORY, 4096, 0x16D);
    }

    /**
     * Returns the directory listing for this directory. Paths in the directory are
     * relative to the directory's path.
     * @return The directory listing for this directory.
     */
    getListing() {
        return Object.keys(this._ls);
    }

    /**
     * Returns the inode for the indicated item, or null if it does not exist.
     * @param p Name of item in this directory.
     */
    getItem(p) {
        const item = this._ls[p];
        return item ? item : null;
    }

    /**
     * Add the given item to the directory listing. Note that the given inode is
     * not copied, and will be mutated by the DirInode if it is a DirInode.
     * @param p Item name to add to the directory listing.
     * @param inode The inode for the
     *   item to add to the directory inode.
     * @return True if it was added, false if it already existed.
     */
    addItem(p, inode) {
        if (p in this._ls) {
            return false;
        }
        this._ls[p] = inode;
        return true;
    }

    /**
     * Removes the given item from the directory listing.
     * @param p Name of item to remove from the directory listing.
     * @return Returns the item
     *   removed, or null if the item did not exist.
     */
    remItem(p) {
        const item = this._ls[p];
        if (item === undefined) {
            return null;
        }
        delete this._ls[p];
        return item;
    }
}


export const isFileInode = (inode) => Boolean(inode) && inode.isFile();

export const isDirInode = (inode) => Boolean(inode) && inode.isDir();


/**
 * A simple class for storing a filesystem index. Assumes that all paths passed
 * to it are *absolute* paths.
 *
 * Can be used as a partial or a full index, although care must be taken if used
 * for the former purpose, especially when directories are concerned.
 */
export class FileIndex {
    constructor() {
        // _index is a single-level key,value store that maps *directory* paths to
        // DirInodes. File information is only contained in DirInodes themselves.
        this._index = {};
        // Create the root directory.
        this.addPath("/", new DirInode());
    }

    /**
     * Runs the given function over all files in the index.
     */
    fileIterator(cb) {
        for (const path in this._index) {
            if (this._index.hasOwnProperty(path)) {
                const dir = this._index[path];
                const files = dir.getListing();
                for (const file of files) {
                    const item = dir.getItem(file);
                    if (isFileInode(item)) {
                        cb(item.getData());
                    }
                }
            }
        }
    }

    /**
     * Adds the given absolute path to the index if it is not already in the index.
     * Creates any needed parent directories.
     * @param path The path to add to the index.
     * @param inode The inode for the
     *   path to add.
     * @return 'True' if it was added or already exists, 'false' if there
     *   was an issue adding it (e.g. item in path is a file, item exists but is
     *   different).
     * @todo If adding fails and implicitly creates directories, we do not clean up
     *   the new empty directories.
     */
    addPath(path, inode) {
        if (!inode) {
            throw new Error("Inode must be specified");
        }
        if (path[0] !== "/") {
            throw new Error(`Path must be absolute, got: ${path}`);
        }
        // Check if it already exists.
        if (this._index.hasOwnProperty(path)) {
            return this._index[path] === inode;
        }
        const splitPath = this._split_path(path);
        const dirpath = splitPath[0];
        const itemname = splitPath[1];
        // Try to add to its parent directory first.
        let parent = this._index[dirpath];
        if (parent === undefined && path !== "/") {
            // Create parent.
            parent = new DirInode();
            if (!this.addPath(dirpath, parent)) {
                return false;
            }
        }
        // Add myself to my parent.
        if (path !== "/") {
            if (!parent.addItem(itemname, inode)) {
                return false;
            }
        }
        // If I'm a directory, add myself to the index.
        if (isDirInode(inode)) {
            this._index[path] = inode;
        }
        return true;
    }

    /**
     * Adds the given absolute path to the index if it is not already in the index.
     * The path is added without special treatment (no joining of adjacent separators, etc).
     * Creates any needed parent directories.
     * @param path The path to add to the index.
     * @param inode The inode for the
     *   path to add.
     * @return 'True' if it was added or already exists, 'false' if there
     *   was an issue adding it (e.g. item in path is a file, item exists but is
     *   different).
     * @todo If adding fails and implicitly creates directories, we do not clean up
     *   the new empty directories.
     */
    addPathFast(path, inode) {
        const itemNameMark = path.lastIndexOf("/");
        const parentPath = itemNameMark === 0 ? "/" : path.substring(0, itemNameMark);
        const itemName = path.substring(itemNameMark + 1);
        // Try to add to its parent directory first.
        let parent = this._index[parentPath];
        if (parent === undefined) {
            // Create parent.
            parent = new DirInode();
            this.addPathFast(parentPath, parent);
        }
        if (!parent.addItem(itemName, inode)) {
            return false;
        }
        // If adding a directory, add to the index as well.
        if (inode.isDir()) {
            this._index[path] = inode;
        }
        return true;
    }

    /**
     * Removes the given path. Can be a file or a directory.
     * @return The removed item,
     *   or null if it did not exist.
     */
    removePath(path) {
        const splitPath = this._split_path(path);
        const dirpath = splitPath[0];
        const itemname = splitPath[1];
        // Try to remove it from its parent directory first.
        const parent = this._index[dirpath];
        if (parent === undefined) {
            return null;
        }
        // Remove myself from my parent.
        const inode = parent.remItem(itemname);
        if (inode === null) {
            return null;
        }
        // If I'm a directory, remove myself from the index, and remove my children.
        if (isDirInode(inode)) {
            const children = inode.getListing();
            for (const child of children) {
                this.removePath(`${path}/${child}`);
            }
            // Remove the directory from the index, unless it's the root.
            if (path !== "/") {
                delete this._index[path];
            }
        }
        return inode;
    }

    /**
     * Retrieves the directory listing of the given path.
     * @return An array of files in the given path, or 'null' if it does not exist.
     */
    ls(path) {
        const item = this._index[path];
        if (item === undefined) {
            return null;
        }
        return item.getListing();
    }

    /**
     * Returns the inode of the given item.
     * @return Returns null if the item does not exist.
     */
    getInode(path) {
        const splitPath = this._split_path(path);
        const dirpath = splitPath[0];
        const itemname = splitPath[1];
        // Retrieve from its parent directory.
        const parent = this._index[dirpath];
        if (parent === undefined) {
            return null;
        }
        // Root case
        if (dirpath === path) {
            return parent;
        }
        return parent.getItem(itemname);
    }

    /**
     * Split into a (directory path, item name) pair
     */
    _split_path(p) {
        const dirpath = path.dirname(p);
        const itemname = p.substr(dirpath.length + (dirpath === "/" ? 0 : 1));
        return [dirpath, itemname];
    }

    /**
     * Static method for constructing indices from a JSON listing.
     * @param listing Directory listing generated by tools/XHRIndexer.coffee
     * @return A new FileIndex object.
     */
    static fromListing(listing) {
        const idx = new FileIndex();
        // Add a root DirNode.
        const rootInode = new DirInode();
        idx._index["/"] = rootInode;
        const queue = [["", listing, rootInode]];
        while (queue.length > 0) {
            let inode;
            const next = queue.pop();
            const pwd = next[0];
            const tree = next[1];
            const parent = next[2];
            for (const node in tree) {
                if (tree.hasOwnProperty(node)) {
                    const children = tree[node];
                    const name = `${pwd}/${node}`;
                    if (children) {
                        idx._index[name] = inode = new DirInode();
                        queue.push([name, children, inode]);
                    } else {
                        // This inode doesn't have correct size information, noted with -1.
                        inode = new FileInode(new Stats(FileType.FILE, -1, 0x16D));
                    }
                    if (parent) {
                        parent._ls[node] = inode;
                    }
                }
            }
        }
        return idx;
    }
}
