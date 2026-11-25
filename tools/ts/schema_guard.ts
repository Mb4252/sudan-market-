interface PostSchema {
    author: string;
    content: string;
    price: number;
    city: string;
    timestamp: string;
}

export function validateSchema(data: any): data is PostSchema {
    if (typeof data !== 'object' || data === null) {
        return false;
    }
    
    const requiredFields: (keyof PostSchema)[] = ['author', 'content', 'price', 'city', 'timestamp'];
    
    for (const field of requiredFields) {
        if (!(field in data)) {
            return false;
        }
    }
    
    if (typeof data.author !== 'string' || data.author.trim() === '') {
        return false;
    }
    
    if (typeof data.content !== 'string' || data.content.trim() === '') {
        return false;
    }
    
    if (typeof data.price !== 'number' || data.price <= 0) {
        return false;
    }
    
    if (typeof data.city !== 'string' || data.city.trim() === '') {
        return false;
    }
    
    if (typeof data.timestamp !== 'string') {
        return false;
    }
    
    try {
        new Date(data.timestamp);
    } catch (e) {
        return false;
    }
    
    return true;
}

// إضافة الدالة إلى النافذة
if (typeof window !== 'undefined') {
    (window as any).validateSchema = validateSchema;
}