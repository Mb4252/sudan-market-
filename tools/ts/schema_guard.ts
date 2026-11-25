interface PostSchema {
    author: string;
    content: string;
    price: number;
    city: string;
    timestamp: string;
}

class SchemaGuard {
    static validatePost(post: any): post is PostSchema {
        return (
            typeof post.author === 'string' &&
            typeof post.content === 'string' &&
            typeof post.price === 'number' &&
            typeof post.city === 'string' &&
            typeof post.timestamp === 'string' &&
            this.isValidDate(post.timestamp)
        );
    }

    static isValidDate(dateString: string): boolean {
        const date = new Date(dateString);
        return !isNaN(date.getTime());
    }
}

export default SchemaGuard;