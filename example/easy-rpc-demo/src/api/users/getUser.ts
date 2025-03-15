export type GetUserRequest = {
	id: string;
};

export type GetUserResponse = {
	id: string;
	name: string;
	email: string;
};

export default async function getUser(body: GetUserRequest): Promise<GetUserResponse> {
	return {
		id: body.id,
		name: 'John Doe',
		email: 'john.doe@example.com',
	};
}
