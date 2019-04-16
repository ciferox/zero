import protoBootstraper from "./proto";
import { getSimpleBuilder, volumePath } from "./helpers";

const {
    fs,
    std: { path: { join } }
} = adone;

const writeExecFile = (execPath, eofBuilder) => new Promise((resolve, reject) => {
    const ws = fs.createWriteStream(execPath);
    eofBuilder.toStream()
        .pipe(ws)
        .on("close", resolve)
        .on("error", reject);
});

describe("nodejs", "packager", "bootstraper", () => {
    let tmpPath;

    beforeEach(async () => {
        tmpPath = await fs.tmpName();
        await fs.mkdir(tmpPath);
    });

    afterEach(async () => {
        await fs.rm(tmpPath);
    });

    it("should mount volumes", async () => {
        const eofBuilder = await getSimpleBuilder();
        const execPath = join(tmpPath, "exec");

        await writeExecFile(execPath, eofBuilder);
        await protoBootstraper(execPath, "volumes:mounted");

        assert.exists(global.__kri_loader__.vfs);

        const appPath = await fs.tmpName();
        await adone.fast.src(volumePath("app.zip"))
            .extract()
            .dest(appPath);
        
        assert.equal(global.__kri_loader__.vfs.readFileSync("/app/index.js", "utf8"), await fs.readFile(join(appPath, "index.js")));

        await fs.rm(appPath);

        delete global.__kri_loader__;
    });
});
