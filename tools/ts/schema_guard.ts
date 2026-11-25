interface Schema {
    [key: string]: any;
}

export class SchemaGuard {
    private schema: Schema;

    constructor(schema: Schema) {
        this.schema = schema;
    }

    validate(data: any): boolean {
        for (const key in this.schema) {
            if (!(key in data)) {
                return false;
            }
            if (typeof data[key] !== this.schema[key]) {
                return false;
            }
        }
        return true;
    }
}