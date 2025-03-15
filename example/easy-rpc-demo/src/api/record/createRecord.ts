export type CreateRecordRequest = {
	title: string;
	description: string;
};

export type CreateRecordResponse = {
	id: string;
	title: string;
	description: string;
};

export default async function createRecord(body: CreateRecordRequest): Promise<CreateRecordResponse> {
	return {
		id: '123',
		title: body.title,
		description: body.description,
	};
}
